import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { CollabDocManager } from "../doc-manager.ts";
import type { CollabPersistence } from "../persistence.ts";
import type { CollabConnection } from "../protocol.ts";

function createMemoryStore() {
  const files = new Map<string, Uint8Array>();
  const store: CollabPersistence & { files: Map<string, Uint8Array> } = {
    files,
    read: vi.fn(async (room: string) => files.get(room) ?? null),
    write: vi.fn(async (room: string, state: Uint8Array) => {
      files.set(room, state);
    }),
  };
  return store;
}

function seedState(text: string) {
  const doc = new Y.Doc();
  doc.getText("content").insert(0, text);
  return Y.encodeStateAsUpdate(doc);
}

const conn: CollabConnection = { send: () => {}, close: () => {} };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("CollabDocManager 打开房间", () => {
  it("首次打开会加载持久化状态", async () => {
    const store = createMemoryStore();
    store.files.set("index", seedState("已落盘的内容"));
    const manager = new CollabDocManager({ persistence: store });

    const shared = await manager.open("index");

    expect(shared.doc.getText("content").toString()).toBe("已落盘的内容");
    expect(manager.size).toBe(1);
  });

  it("重复打开同一房间复用同一个文档实例", async () => {
    const store = createMemoryStore();
    const manager = new CollabDocManager({ persistence: store });

    const first = await manager.open("index");
    const second = await manager.open("index");

    expect(second).toBe(first);
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it("并发打开只读一次持久化", async () => {
    const store = createMemoryStore();
    const manager = new CollabDocManager({ persistence: store });

    const [a, b] = await Promise.all([manager.open("index"), manager.open("index")]);

    expect(a).toBe(b);
    expect(store.read).toHaveBeenCalledTimes(1);
  });

  it("读持久化失败时房间照常打开（空文档），错误上报给 onError", async () => {
    const store = createMemoryStore();
    const failure = new Error("磁盘坏了");
    store.read = vi.fn(async () => {
      throw failure;
    });
    const onError = vi.fn();
    const manager = new CollabDocManager({ persistence: store, onError });

    const shared = await manager.open("index");

    expect(shared.doc.getText("content").toString()).toBe("");
    expect(onError).toHaveBeenCalledWith(failure, "index");
  });

  it("空的持久化状态不会被当成 update 应用", async () => {
    const store = createMemoryStore();
    store.files.set("index", new Uint8Array());
    const manager = new CollabDocManager({ persistence: store });

    await expect(manager.open("index")).resolves.toBeDefined();
  });
});

describe("CollabDocManager 落盘", () => {
  it("编辑后经过静默期才写一次盘", async () => {
    const store = createMemoryStore();
    const manager = new CollabDocManager({ persistence: store, saveDebounceMs: 50 });
    const shared = await manager.open("index");

    shared.doc.getText("content").insert(0, "a");
    shared.doc.getText("content").insert(1, "b");
    expect(store.write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);

    expect(store.write).toHaveBeenCalledTimes(1);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, store.files.get("index") as Uint8Array);
    expect(restored.getText("content").toString()).toBe("ab");
  });

  it("加载持久化状态本身不会触发回写", async () => {
    const store = createMemoryStore();
    store.files.set("index", seedState("已落盘"));
    const manager = new CollabDocManager({ persistence: store, saveDebounceMs: 50 });
    await manager.open("index");

    await vi.advanceTimersByTimeAsync(200);

    expect(store.write).not.toHaveBeenCalled();
  });

  it("没有变更时 flush 不写盘", async () => {
    const store = createMemoryStore();
    const manager = new CollabDocManager({ persistence: store });
    await manager.open("index");

    await manager.flush("index");

    expect(store.write).not.toHaveBeenCalled();
  });

  it("写盘失败上报 onError 且不炸掉房间", async () => {
    const store = createMemoryStore();
    const failure = new Error("磁盘满了");
    store.write = vi.fn(async () => {
      throw failure;
    });
    const onError = vi.fn();
    const manager = new CollabDocManager({ persistence: store, onError, saveDebounceMs: 10 });
    const shared = await manager.open("index");

    shared.doc.getText("content").insert(0, "a");
    await vi.advanceTimersByTimeAsync(10);

    expect(onError).toHaveBeenCalledWith(failure, "index");
    expect(manager.size).toBe(1);
  });

  it("flushAll 把所有房间的未落盘内容写出去", async () => {
    const store = createMemoryStore();
    const manager = new CollabDocManager({ persistence: store, saveDebounceMs: 10_000 });
    const index = await manager.open("index");
    const doc = await manager.open("doc:abcdefgh");
    index.doc.getText("content").insert(0, "i");
    doc.doc.getText("content").insert(0, "d");

    await manager.flushAll();

    expect(store.write).toHaveBeenCalledTimes(2);
    expect(store.files.has("index")).toBe(true);
    expect(store.files.has("doc:abcdefgh")).toBe(true);
  });
});

describe("CollabDocManager 关闭房间", () => {
  it("仍有连接时不关闭", async () => {
    const store = createMemoryStore();
    const manager = new CollabDocManager({ persistence: store });
    const shared = await manager.open("index");
    shared.conns.set(conn, new Set());

    await expect(manager.closeIfEmpty("index")).resolves.toBe(false);
    expect(manager.size).toBe(1);
  });

  it("最后一个连接离开时先落盘再销毁（不丢最后一段编辑）", async () => {
    const store = createMemoryStore();
    const manager = new CollabDocManager({ persistence: store, saveDebounceMs: 10_000 });
    const shared = await manager.open("index");
    shared.doc.getText("content").insert(0, "最后一笔");

    await expect(manager.closeIfEmpty("index")).resolves.toBe(true);

    expect(store.write).toHaveBeenCalledTimes(1);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, store.files.get("index") as Uint8Array);
    expect(restored.getText("content").toString()).toBe("最后一笔");
    expect(manager.size).toBe(0);
  });

  it("关闭后再打开能读回刚落盘的内容", async () => {
    const store = createMemoryStore();
    const manager = new CollabDocManager({ persistence: store, saveDebounceMs: 10_000 });
    const shared = await manager.open("index");
    shared.doc.getText("content").insert(0, "重启前");
    await manager.closeIfEmpty("index");

    const reopened = await manager.open("index");

    expect(reopened.doc.getText("content").toString()).toBe("重启前");
  });

  it("关闭不存在的房间返回 false", async () => {
    const manager = new CollabDocManager({ persistence: createMemoryStore() });
    await expect(manager.closeIfEmpty("index")).resolves.toBe(false);
  });
});
