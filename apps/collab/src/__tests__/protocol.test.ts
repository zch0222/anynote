import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { describe, expect, it, vi } from "vitest";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import {
  type CollabConnection,
  CollabDoc,
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  addConnection,
  encodeAwareness,
  handleMessage,
  removeConnection,
} from "../protocol.ts";

/**
 * 把「客户端」接到服务端的同一组协议函数上：send 直接同步回灌，
 * 因此一次编辑会真实走完 update → 广播 → 对端应用的全过程。
 */
class TestClient {
  readonly doc = new Y.Doc();
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  readonly conn: CollabConnection;
  closed = false;
  received = 0;

  constructor(private readonly shared: CollabDoc) {
    this.conn = {
      send: (data) => this.receive(data),
      close: () => {
        this.closed = true;
      },
    };

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.toServer(encoding.toUint8Array(encoder));
    });

    this.awareness.on(
      "update",
      (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        if (origin === this) return;
        const changed = [...changes.added, ...changes.updated, ...changes.removed];
        if (changed.length > 0) this.toServer(encodeAwareness(this.awareness, changed));
      },
    );
  }

  private receive(data: Uint8Array) {
    this.received += 1;
    const decoder = decoding.createDecoder(data);
    const type = decoding.readVarUint(decoder);
    if (type === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
      if (encoding.length(encoder) > 1) this.toServer(encoding.toUint8Array(encoder));
      return;
    }
    if (type === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(
        this.awareness,
        decoding.readVarUint8Array(decoder),
        this,
      );
    }
  }

  private toServer(data: Uint8Array) {
    handleMessage(this.shared, this.conn, data);
  }

  /** 真实 y-websocket 客户端连上后也会主动发一次 syncStep1，服务端据此回灌已有内容。 */
  handshake() {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.toServer(encoding.toUint8Array(encoder));
  }

  text() {
    return this.doc.getText("content").toString();
  }
}

function connect(shared: CollabDoc) {
  const client = new TestClient(shared);
  addConnection(shared, client.conn);
  client.handshake();
  return client;
}

describe("协同同步", () => {
  it("新连接握手后拿到服务端已有内容", () => {
    const shared = new CollabDoc("index");
    shared.doc.getText("content").insert(0, "服务端已有内容");

    const client = connect(shared);

    expect(client.text()).toBe("服务端已有内容");
    expect(shared.conns.size).toBe(1);
  });

  it("一端编辑后另一端收敛到同一内容", () => {
    const shared = new CollabDoc("index");
    const a = connect(shared);
    const b = connect(shared);

    a.doc.getText("content").insert(0, "来自 A");
    b.doc.getText("content").insert(0, "来自 B：");

    expect(shared.doc.getText("content").toString()).toBe(b.text());
    expect(a.text()).toBe(b.text());
    expect(a.text()).toContain("来自 A");
    expect(a.text()).toContain("来自 B");
  });

  it("并发编辑不丢字符（CRDT 合并而非后写覆盖）", () => {
    const shared = new CollabDoc("index");
    const a = connect(shared);
    const b = connect(shared);

    a.doc.getText("content").insert(0, "AAA");
    b.doc.getText("content").insert(0, "BBB");

    const merged = shared.doc.getText("content").toString();
    expect(merged).toHaveLength(6);
    expect(merged).toContain("AAA");
    expect(merged).toContain("BBB");
  });

  it("服务端本地加载的更新在无人连接时不广播", () => {
    const shared = new CollabDoc("index");
    const broadcast = vi.spyOn(shared, "broadcast");
    Y.applyUpdate(shared.doc, Y.encodeStateAsUpdate(new Y.Doc()), Symbol.for("other"));
    expect(broadcast).toHaveBeenCalledTimes(0);
    shared.destroy();
  });
});

describe("awareness", () => {
  it("一端上线后另一端能看到它的状态", () => {
    const shared = new CollabDoc("index");
    const a = connect(shared);
    const b = connect(shared);

    a.awareness.setLocalStateField("user", { name: "甲", color: "#2563eb" });

    expect(b.awareness.getStates().get(a.doc.clientID)).toEqual({
      user: { name: "甲", color: "#2563eb" },
    });
  });

  it("新连接会立刻收到已在线成员的 awareness", () => {
    const shared = new CollabDoc("index");
    const a = connect(shared);
    a.awareness.setLocalStateField("user", { name: "甲" });

    const b = connect(shared);

    expect([...b.awareness.getStates().keys()]).toContain(a.doc.clientID);
  });

  it("断开连接会清掉该连接持有的 awareness（光标不残留）", () => {
    const shared = new CollabDoc("index");
    const a = connect(shared);
    const b = connect(shared);
    a.awareness.setLocalStateField("user", { name: "甲" });
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(true);

    removeConnection(shared, a.conn);

    expect(shared.conns.size).toBe(1);
    expect(a.closed).toBe(true);
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false);
  });

  it("移除未登记的连接是空操作", () => {
    const shared = new CollabDoc("index");
    const ghost: CollabConnection = { send: vi.fn(), close: vi.fn() };
    expect(() => removeConnection(shared, ghost)).not.toThrow();
    expect(ghost.close).not.toHaveBeenCalled();
  });
});

describe("handleMessage 容错", () => {
  it("未知消息类型返回 null 且不影响连接", () => {
    const shared = new CollabDoc("index");
    const conn: CollabConnection = { send: vi.fn(), close: vi.fn() };
    shared.conns.set(conn, new Set());

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 99);
    expect(handleMessage(shared, conn, encoding.toUint8Array(encoder))).toBeNull();
    expect(shared.conns.has(conn)).toBe(true);
  });

  it("畸形字节不抛错，只返回 null", () => {
    const shared = new CollabDoc("index");
    const conn: CollabConnection = { send: vi.fn(), close: vi.fn() };
    shared.conns.set(conn, new Set());

    expect(handleMessage(shared, conn, new Uint8Array([MESSAGE_AWARENESS, 200, 200]))).toBeNull();
    expect(handleMessage(shared, conn, new Uint8Array())).toBeNull();
  });

  it("syncStep1 会得到回包，普通 update 不会", () => {
    const shared = new CollabDoc("index");
    shared.doc.getText("content").insert(0, "x");
    const conn: CollabConnection = { send: vi.fn(), close: vi.fn() };
    shared.conns.set(conn, new Set());

    const step1 = encoding.createEncoder();
    encoding.writeVarUint(step1, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(step1, new Y.Doc());
    expect(handleMessage(shared, conn, encoding.toUint8Array(step1))).toBe(MESSAGE_SYNC);
    expect(conn.send).toHaveBeenCalledTimes(1);

    vi.mocked(conn.send).mockClear();
    const empty = new Y.Doc();
    const update = encoding.createEncoder();
    encoding.writeVarUint(update, MESSAGE_SYNC);
    syncProtocol.writeUpdate(update, Y.encodeStateAsUpdate(empty));
    handleMessage(shared, conn, encoding.toUint8Array(update));
    // 空 update 不改变文档，服务端也就没有东西要广播回去
    expect(conn.send).not.toHaveBeenCalled();
  });
});
