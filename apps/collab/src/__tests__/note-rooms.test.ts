import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { type Converter, createConverter, deterministicLineage } from "../converter.ts";
import { type NoteRoom, NoteRoomManager } from "../note-rooms.ts";
import {
  NoteNotFoundError,
  type NoteSnapshot,
  type NoteStore,
  NoteStoreError,
  type StoreInput,
} from "../note-store.ts";
import type { RoomSpool, SpoolRecord } from "../persistence.ts";
import {
  ANYNOTE_STORED,
  CLOSE_NOT_FOUND,
  type CollabConnection,
  decodeAnynoteMessage,
} from "../protocol.ts";

const NOTE_ID = 42;
const ROOM = `note:${NOTE_ID}`;
const BASE_TIME = 1_790_265_600_000;

let converter: Converter;

beforeAll(() => {
  converter = createConverter();
});

afterAll(() => {
  converter.destroy();
});

/** 假 note 服务：按版本号做原子比较，模拟外部写入、删除与故障。 */
class FakeNoteService implements NoteStore {
  title = "周会纪要";
  content = "# 周会纪要\n\n第一段\n\n第二段";
  version = BASE_TIME;
  state: Uint8Array | null = null;
  stateVersion: string | null = null;
  epoch: string | null = null;
  deleted = false;
  failures = 0;
  appliedButTimedOut = 0;
  loadDelayMs = 0;
  readonly stores: StoreInput[] = [];
  loads = 0;

  async load(noteId: number): Promise<NoteSnapshot> {
    this.loads += 1;
    if (this.loadDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, this.loadDelayMs));
    if (this.deleted) throw new NoteNotFoundError(noteId);
    return {
      title: this.title,
      content: this.content,
      version: String(this.version),
      state: this.state,
      stateVersion: this.stateVersion,
      epoch: this.epoch,
    };
  }

  async store(noteId: number, input: StoreInput) {
    this.stores.push(input);
    if (this.deleted) throw new NoteNotFoundError(noteId);
    if (this.failures > 0) {
      this.failures -= 1;
      throw new NoteStoreError("note 服务不可用");
    }
    if (this.appliedButTimedOut > 0) {
      // 请求其实已经写进库，只是响应没回来（客户端超时）
      this.appliedButTimedOut -= 1;
      await this.store(noteId, input);
      this.stores.pop();
      throw new NoteStoreError("请求 note 服务失败：The operation was aborted due to timeout");
    }
    if (input.baseVersion !== String(this.version))
      return { ok: false as const, reason: "conflict" as const };
    this.version += 1000;
    this.content = input.content;
    if (input.title) this.title = input.title;
    this.state = input.state;
    this.stateVersion = String(this.version);
    this.epoch = input.epoch;
    return { ok: true as const, version: String(this.version) };
  }

  /** 模拟 CLI、历史恢复等外部写入。 */
  externalWrite(content: string) {
    this.version += 1000;
    this.content = content;
  }
}

class MemorySpool implements RoomSpool {
  readonly records = new Map<string, SpoolRecord>();
  readonly quarantined: string[] = [];
  async read(room: string) {
    return this.records.get(room) ?? null;
  }
  async write(room: string, record: SpoolRecord) {
    this.records.set(room, record);
  }
  async remove(room: string) {
    this.records.delete(room);
  }
  async quarantine(room: string) {
    this.quarantined.push(room);
    this.records.delete(room);
  }
}

function connection(userId: string): CollabConnection & { close: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn(),
    close: vi.fn(),
    identity: { userId, name: `用户${userId}`, color: "#2563eb" },
  };
}

function join(room: NoteRoom, conn: CollabConnection) {
  room.shared.conns.set(conn, new Set());
}

/** 模拟一个客户端把房间内容改成 markdown，并把差异以该连接为 origin 应用到房间。 */
function edit(room: NoteRoom, conn: CollabConnection, markdown: string) {
  const client = new Y.Doc();
  Y.applyUpdate(client, Y.encodeStateAsUpdate(room.shared.doc));
  converter.applyMarkdown(client, markdown);
  const diff = Y.encodeStateAsUpdate(client, Y.encodeStateVector(room.shared.doc));
  Y.applyUpdate(room.shared.doc, diff, conn);
  client.destroy();
}

/** 连接收到的落库通知负载。 */
function storedNotices(conn: CollabConnection & { send: ReturnType<typeof vi.fn> }) {
  return conn.send.mock.calls
    .map(([message]) => decodeAnynoteMessage(message as Uint8Array))
    .filter((decoded) => decoded?.subType === ANYNOTE_STORED)
    .map((decoded) => decoded?.payload);
}

function markdownOf(room: NoteRoom): string {
  return converter.serialize(room.shared.doc).markdown;
}

let service: FakeNoteService;
let spool: MemorySpool;
let errors: unknown[];

function createManager() {
  return new NoteRoomManager({
    store: service,
    converter,
    spool,
    debounceMs: 2_000,
    maxDebounceMs: 10_000,
    onError: (error) => errors.push(error),
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  service = new FakeNoteService();
  spool = new MemorySpool();
  errors = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe("开房的三个分支", () => {
  it("从没存过 Y 状态时由 Markdown 构建，谱系由笔记与版本确定", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);

    expect(markdownOf(room)).toBe("# 周会纪要\n\n第一段\n\n第二段");
    expect(room.epoch).toBe(deterministicLineage(NOTE_ID, String(BASE_TIME)).epoch);
  });

  it("同一版本重复构建得到逐字节相同的状态，旧客户端的副本不会被当成新内容", async () => {
    const first = await createManager().open(ROOM);
    const second = await createManager().open(ROOM);
    expect(Y.encodeStateAsUpdate(second.shared.doc)).toEqual(
      Y.encodeStateAsUpdate(first.shared.doc),
    );

    const merged = new Y.Doc();
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(first.shared.doc));
    Y.applyUpdate(merged, Y.encodeStateAsUpdate(second.shared.doc));
    expect(converter.serialize(merged).markdown).toBe("# 周会纪要\n\n第一段\n\n第二段");
  });

  it("Y 状态与库里版本一致时直接恢复，谱系沿用", async () => {
    const source = new Y.Doc();
    Y.applyUpdate(source, converter.buildState("# 周会纪要\n\n来自状态的正文"));
    service.content = "# 周会纪要\n\n来自状态的正文";
    service.state = Y.encodeStateAsUpdate(source);
    service.stateVersion = String(service.version);
    service.epoch = "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";

    const room = await createManager().open(ROOM);

    expect(room.epoch).toBe("7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f");
    expect(markdownOf(room)).toBe("# 周会纪要\n\n来自状态的正文");
  });

  it("Y 状态过期（关房期间有外部写入）时恢复后按差异更新到库里的内容，谱系不变", async () => {
    const source = new Y.Doc();
    Y.applyUpdate(source, converter.buildState("# 周会纪要\n\n旧正文"));
    service.state = Y.encodeStateAsUpdate(source);
    service.stateVersion = String(service.version - 5_000);
    service.epoch = "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";
    service.content = "# 周会纪要\n\n外部写入的正文";

    const room = await createManager().open(ROOM);

    expect(room.epoch).toBe("7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f");
    expect(markdownOf(room)).toBe("# 周会纪要\n\n外部写入的正文");
  });

  it("正文没有顶部 H1 时用标题补上，与前端打开时的规范化一致", async () => {
    service.content = "没有标题的正文";
    const room = await createManager().open(ROOM);
    expect(markdownOf(room)).toBe("# 周会纪要\n\n没有标题的正文");
  });

  it("打开笔记不写库，即使正文经过了规范化", async () => {
    service.content = "没有标题的正文";
    const manager = createManager();
    await manager.open(ROOM);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await manager.closeIfEmpty(ROOM)).toBe(true);
    expect(service.stores).toHaveLength(0);
  });

  it("并发打开同一房间只加载一次", async () => {
    const manager = createManager();
    const [a, b] = await Promise.all([manager.open(ROOM), manager.open(ROOM)]);
    expect(a.shared).toBe(b.shared);
    expect(service.loads).toBe(1);
  });

  it("笔记不存在时抛 NoteNotFoundError", async () => {
    service.deleted = true;
    await expect(createManager().open(ROOM)).rejects.toBeInstanceOf(NoteNotFoundError);
  });
});

describe("防抖写库", () => {
  it("最后一次更新后静默 2 秒写库，带基准版本号、谱系与编辑者", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段改");
    await vi.advanceTimersByTimeAsync(1_900);
    expect(service.stores).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);

    expect(service.stores).toHaveLength(1);
    expect(service.stores[0]).toMatchObject({
      title: "周会纪要",
      content: "# 周会纪要\n\n第一段\n\n第二段改",
      baseVersion: String(BASE_TIME),
      epoch: room.epoch,
      operatorId: 7,
    });
  });

  it("持续编辑时每次更新重置静默期，但首次变脏满 10 秒必写一次", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    for (let index = 0; index < 11; index += 1) {
      edit(room, alice, `# 周会纪要\n\n第一段\n\n第二段 ${index}`);
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(service.stores).toHaveLength(1);
    expect(service.stores[0]?.content).toMatch(/第二段 9$/);
  });

  it("写库请求在路上时到达的编辑会在写完后再写一次", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段 A");
    const flushing = manager.flush(ROOM);
    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段 B");
    await flushing;
    await vi.advanceTimersByTimeAsync(2_100);

    expect(service.stores.map((input) => input.content)).toEqual([
      "# 周会纪要\n\n第一段\n\n第二段 A",
      "# 周会纪要\n\n第一段\n\n第二段 B",
    ]);
    expect(service.stores[1]?.baseVersion).toBe(String(BASE_TIME + 1000));
  });

  it("序列化结果与上次落库相同则不写库", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段改");
    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段");
    await vi.advanceTimersByTimeAsync(2_100);

    expect(service.stores).toHaveLength(0);
  });

  it("写库成功后向房间里的每个连接广播落库通知，带新版本号与标题", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    const bob = connection("8");
    join(room, alice);
    join(room, bob);

    edit(room, alice, "# 改过的标题\n\n第一段\n\n第二段");
    await vi.advanceTimersByTimeAsync(2_100);

    const expected = { version: String(BASE_TIME + 1000), title: "改过的标题" };
    expect(storedNotices(alice)).toEqual([expected]);
    expect(storedNotices(bob)).toEqual([expected]);
  });

  it("没有写库（内容与库里一致）或写库失败时不发落库通知", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段改");
    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段");
    await vi.advanceTimersByTimeAsync(2_100);
    service.failures = 1;
    edit(room, alice, "# 周会纪要\n\n写库会失败");
    await vi.advanceTimersByTimeAsync(2_100);

    expect(service.stores).toHaveLength(1);
    expect(storedNotices(alice)).toEqual([]);
  });

  it("最后一人离开时立即写库，写成功后销毁房间", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);
    edit(room, alice, "# 周会纪要\n\n离开前的改动");
    room.shared.conns.delete(alice);

    expect(await manager.closeIfEmpty(ROOM)).toBe(true);
    expect(service.content).toBe("# 周会纪要\n\n离开前的改动");
    expect(manager.size).toBe(0);
  });
});

describe("外部写入的三方合并", () => {
  it("写库撞 A0409 时合并外部写入，房间里的并发编辑与外部改动都保留", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    service.externalWrite("# 周会纪要\n\n第一段（外部）\n\n第二段");
    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段（房间）");
    await vi.advanceTimersByTimeAsync(2_100);

    expect(service.content).toBe("# 周会纪要\n\n第一段（外部）\n\n第二段（房间）");
    expect(markdownOf(room)).toBe("# 周会纪要\n\n第一段（外部）\n\n第二段（房间）");
    expect(service.stores.at(-1)?.baseVersion).toBe(String(BASE_TIME + 1000));
  });

  it("合并出的外部改动广播给在线连接", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    service.externalWrite("# 周会纪要\n\n第一段（外部）\n\n第二段");
    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段（房间）");
    alice.send.mockClear();
    await vi.advanceTimersByTimeAsync(2_100);

    expect(alice.send).toHaveBeenCalled();
  });

  it("连续冲突超过 3 次后改走退避，不会无限重写", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);
    // 每次写库前都有人抢先写入：第一次写库撞 A0409 之后，每次回读合并完再写仍然撞 A0409
    const originalStore = service.store.bind(service);
    service.store = async (noteId, input) => {
      service.externalWrite(`# 周会纪要\n\n外部 ${service.version}\n\n房间里的改动`);
      return originalStore(noteId, input);
    };

    edit(room, alice, "# 周会纪要\n\n房间里的改动");
    await vi.advanceTimersByTimeAsync(2_100);

    expect(service.stores.length).toBe(4);
    expect(manager.health().failingRooms).toEqual([
      expect.objectContaining({ room: ROOM, failures: 1 }),
    ]);
  });

  it("外部写入通知到达时在线房间立即合并，内容与库一致时不再写库", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);

    service.externalWrite("# 周会纪要\n\n通知带来的外部改动");
    await manager.applyExternalUpdate(NOTE_ID);
    await vi.advanceTimersByTimeAsync(2_100);

    expect(markdownOf(room)).toBe("# 周会纪要\n\n通知带来的外部改动");
    expect(service.stores).toHaveLength(0);
  });

  it("房间不在内存里时忽略外部写入通知", async () => {
    await createManager().applyExternalUpdate(NOTE_ID);
    expect(service.loads).toBe(0);
  });
});

describe("失败、退避与应急落盘", () => {
  it("写库失败时保持脏状态按退避重试，恢复后写成功", async () => {
    service.failures = 2;
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    edit(room, alice, "# 周会纪要\n\n改动");
    await vi.advanceTimersByTimeAsync(2_100);
    expect(manager.health().failingRooms).toHaveLength(1);
    expect(manager.health().pendingStores).toBe(1);

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(4_000);

    expect(service.content).toBe("# 周会纪要\n\n改动");
    expect(manager.health().failingRooms).toHaveLength(0);
  });

  it("写库超时但实际已生效时，重试撞 A0409 按 Y 状态合并，自己的改动不会再并入一遍", async () => {
    service.appliedButTimedOut = 1;
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);

    edit(room, alice, "# 周会纪要\n\n第一段\n\n第二段\n\n超时期间写的一段");
    await vi.advanceTimersByTimeAsync(2_100);
    expect(manager.health().failingRooms).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_100);

    expect(service.content).toBe("# 周会纪要\n\n第一段\n\n第二段\n\n超时期间写的一段");
    expect(markdownOf(room)).toBe("# 周会纪要\n\n第一段\n\n第二段\n\n超时期间写的一段");
    expect(manager.health().failingRooms).toHaveLength(0);
  });

  it("最后一人离开时写库失败，房间保留并在后台继续重试，成功后销毁", async () => {
    service.failures = 1;
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);
    edit(room, alice, "# 周会纪要\n\n离开前的改动");
    room.shared.conns.delete(alice);

    expect(await manager.closeIfEmpty(ROOM)).toBe(false);
    expect(manager.size).toBe(1);

    await vi.advanceTimersByTimeAsync(2_100);
    expect(service.content).toBe("# 周会纪要\n\n离开前的改动");
    expect(manager.size).toBe(0);
  });

  it("退出时写库仍失败的房间写入应急落盘，下次开房恢复并补写", async () => {
    service.failures = 100;
    const first = createManager();
    const room = await first.open(ROOM);
    const alice = connection("7");
    join(room, alice);
    edit(room, alice, "# 周会纪要\n\n只在内存里的改动");

    await first.flushAll(1_000);
    expect(spool.records.has(ROOM)).toBe(true);

    service.failures = 0;
    const second = createManager();
    const restored = await second.open(ROOM);
    expect(markdownOf(restored)).toBe("# 周会纪要\n\n只在内存里的改动");
    await vi.advanceTimersByTimeAsync(2_100);

    expect(service.content).toBe("# 周会纪要\n\n只在内存里的改动");
    expect(spool.records.has(ROOM)).toBe(false);
    // 恢复补写时本进程里没有人编辑过，操作者交给 note 服务沿用笔记的最后更新者
    expect(service.stores.at(-1)?.operatorId).toBeNull();
  });

  it("应急落盘的谱系与房间不一致时不恢复，留档待人工处理", async () => {
    spool.records.set(ROOM, {
      epoch: "00000000-0000-5000-8000-000000000000",
      state: converter.buildState("# 别的谱系"),
    });

    const room = await createManager().open(ROOM);

    expect(markdownOf(room)).toBe("# 周会纪要\n\n第一段\n\n第二段");
    expect(spool.quarantined).toEqual([ROOM]);
  });

  it("笔记被删除后写库时断开所有连接（4404）并丢弃房间", async () => {
    const manager = createManager();
    const room = await manager.open(ROOM);
    const alice = connection("7");
    join(room, alice);
    edit(room, alice, "# 周会纪要\n\n改动");
    service.deleted = true;

    await vi.advanceTimersByTimeAsync(2_100);

    expect(alice.close).toHaveBeenCalledWith(CLOSE_NOT_FOUND, "note-deleted");
    expect(manager.size).toBe(0);
  });
});
