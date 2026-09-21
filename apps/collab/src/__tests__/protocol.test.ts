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

  constructor(
    private readonly shared: CollabDoc,
    readonly = false,
  ) {
    this.conn = {
      send: (data) => this.receive(data),
      close: () => {
        this.closed = true;
      },
      readonly,
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

function connect(shared: CollabDoc, readonly = false) {
  const client = new TestClient(shared, readonly);
  addConnection(shared, client.conn);
  client.handshake();
  return client;
}

describe("协同同步", () => {
  it("新连接握手后拿到服务端已有内容", () => {
    const shared = new CollabDoc("note:1");
    shared.doc.getText("content").insert(0, "服务端已有内容");

    const client = connect(shared);

    expect(client.text()).toBe("服务端已有内容");
    expect(shared.conns.size).toBe(1);
  });

  it("一端编辑后另一端收敛到同一内容", () => {
    const shared = new CollabDoc("note:1");
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
    const shared = new CollabDoc("note:1");
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
    const shared = new CollabDoc("note:1");
    const broadcast = vi.spyOn(shared, "broadcast");
    Y.applyUpdate(shared.doc, Y.encodeStateAsUpdate(new Y.Doc()), Symbol.for("other"));
    expect(broadcast).toHaveBeenCalledTimes(0);
    shared.destroy();
  });
});

describe("只读连接的写方向拦截（D2 / §6.3）", () => {
  /** 直接构造一条 sync 消息，不经过 TestClient 的自动回灌，便于精确控制子类型。 */
  function syncMessage(write: (encoder: encoding.Encoder) => void) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    write(encoder);
    return encoding.toUint8Array(encoder);
  }

  it("只读连接仍能完成初始 sync：syncStep1 得到 syncStep2 回包", () => {
    const shared = new CollabDoc("note:1");
    shared.doc.getText("content").insert(0, "已有内容");

    // 只读客户端完整跑一次握手 —— 这正是「只读用户连上却永远看不到内容」的回归保护
    const reader = connect(shared, true);

    expect(reader.text()).toBe("已有内容");
    expect(shared.rejectedWrites).toBe(0);
  });

  it("只读连接推送的 update 被丢弃，文档与服务端都不变", () => {
    const shared = new CollabDoc("note:1");
    const reader = connect(shared, true);

    const before = Y.encodeStateAsUpdate(shared.doc);
    const foreign = new Y.Doc();
    foreign.getText("content").insert(0, "越权写入");
    handleMessage(
      shared,
      reader.conn,
      syncMessage((encoder) => syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(foreign))),
    );

    expect(Y.encodeStateAsUpdate(shared.doc)).toEqual(before);
    expect(shared.doc.getText("content").toString()).toBe("");
    expect(shared.rejectedWrites).toBe(1);
  });

  it("只读连接推送的 syncStep2 被丢弃（不把对端状态灌进来）", () => {
    const shared = new CollabDoc("note:1");
    const reader = connect(shared, true);

    const foreign = new Y.Doc();
    foreign.getText("content").insert(0, "对端推状态");
    handleMessage(
      shared,
      reader.conn,
      syncMessage((encoder) => syncProtocol.writeSyncStep2(encoder, foreign, undefined)),
    );

    expect(shared.doc.getText("content").toString()).toBe("");
    expect(shared.rejectedWrites).toBe(1);
  });

  it("可写连接的 update 照常应用，计数不增加", () => {
    const shared = new CollabDoc("note:1");
    const writer = connect(shared);

    writer.doc.getText("content").insert(0, "正常写入");

    expect(shared.doc.getText("content").toString()).toBe("正常写入");
    expect(shared.rejectedWrites).toBe(0);
  });

  it("只读连接的 awareness 照常放行（要能看到别人的光标）", () => {
    const shared = new CollabDoc("note:1");
    const reader = connect(shared, true);
    const writer = connect(shared);

    writer.awareness.setLocalStateField("user", { name: "写者", color: "#2563eb" });

    expect(reader.awareness.getStates().get(writer.doc.clientID)).toEqual({
      user: { name: "写者", color: "#2563eb" },
    });
    expect(shared.rejectedWrites).toBe(0);
  });

  it("拦截只读写之后，同一连接仍能继续参与 sync 读（丢写不等于断连）", () => {
    const shared = new CollabDoc("note:1");
    shared.doc.getText("content").insert(0, "初始");
    const reader = connect(shared, true);

    // 先丢一条写
    const foreign = new Y.Doc();
    foreign.getText("content").insert(0, "x");
    handleMessage(
      shared,
      reader.conn,
      syncMessage((encoder) => syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(foreign))),
    );
    expect(shared.rejectedWrites).toBe(1);

    // 再发 syncStep1：仍应拿到 syncStep2（连接未被掐断，读路径完好）
    const sent = vi.fn();
    reader.conn.send = sent;
    handleMessage(
      shared,
      reader.conn,
      syncMessage((encoder) => syncProtocol.writeSyncStep1(encoder, new Y.Doc())),
    );
    expect(sent).toHaveBeenCalledTimes(1);
    expect(reader.text()).toBe("初始");
  });
});

describe("awareness 身份以令牌为准", () => {
  it("客户端自报的 name/color 会被连接上的令牌身份覆盖", () => {
    const shared = new CollabDoc("note:1");
    const conn: CollabConnection = {
      send: vi.fn(),
      close: vi.fn(),
      identity: { userId: "7", name: "令牌名", color: "#16a34a" },
    };
    shared.conns.set(conn, new Set());

    const other = new Y.Doc();
    const otherAwareness = new awarenessProtocol.Awareness(other);
    otherAwareness.setLocalStateField("user", { name: "伪造名", color: "#000000" });
    handleMessage(shared, conn, encodeAwareness(otherAwareness, [other.clientID]));

    const stored = shared.awareness.getStates().get(other.clientID) as {
      user: { name: string; color: string };
    };
    expect(stored.user).toEqual({ name: "令牌名", color: "#16a34a" });
  });
});

describe("awareness", () => {
  it("一端上线后另一端能看到它的状态", () => {
    const shared = new CollabDoc("note:1");
    const a = connect(shared);
    const b = connect(shared);

    a.awareness.setLocalStateField("user", { name: "甲", color: "#2563eb" });

    expect(b.awareness.getStates().get(a.doc.clientID)).toEqual({
      user: { name: "甲", color: "#2563eb" },
    });
  });

  it("新连接会立刻收到已在线成员的 awareness", () => {
    const shared = new CollabDoc("note:1");
    const a = connect(shared);
    a.awareness.setLocalStateField("user", { name: "甲" });

    const b = connect(shared);

    expect([...b.awareness.getStates().keys()]).toContain(a.doc.clientID);
  });

  it("断开连接会清掉该连接持有的 awareness（光标不残留）", () => {
    const shared = new CollabDoc("note:1");
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
    const shared = new CollabDoc("note:1");
    const ghost: CollabConnection = { send: vi.fn(), close: vi.fn() };
    expect(() => removeConnection(shared, ghost)).not.toThrow();
    expect(ghost.close).not.toHaveBeenCalled();
  });
});

describe("handleMessage 容错", () => {
  it("未知消息类型返回 null 且不影响连接", () => {
    const shared = new CollabDoc("note:1");
    const conn: CollabConnection = { send: vi.fn(), close: vi.fn() };
    shared.conns.set(conn, new Set());

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 99);
    expect(handleMessage(shared, conn, encoding.toUint8Array(encoder))).toBeNull();
    expect(shared.conns.has(conn)).toBe(true);
  });

  it("畸形字节不抛错，只返回 null", () => {
    const shared = new CollabDoc("note:1");
    const conn: CollabConnection = { send: vi.fn(), close: vi.fn() };
    shared.conns.set(conn, new Set());

    expect(handleMessage(shared, conn, new Uint8Array([MESSAGE_AWARENESS, 200, 200]))).toBeNull();
    expect(handleMessage(shared, conn, new Uint8Array())).toBeNull();
  });

  it("syncStep1 会得到回包，普通 update 不会", () => {
    const shared = new CollabDoc("note:1");
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
