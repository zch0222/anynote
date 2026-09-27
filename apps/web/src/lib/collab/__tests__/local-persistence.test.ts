import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  LOCAL_NOTE_COMPACT_THRESHOLD,
  LOCAL_NOTE_RETENTION_MS,
  clearAllLocalNotes,
  deleteLocalNote,
  hasLocalNote,
  openLocalNoteStore,
  pruneStaleLocalNotes,
} from "../local-persistence";

const originalIndexedDb = globalThis.indexedDB;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  window.localStorage.clear();
});

afterEach(() => {
  globalThis.indexedDB = originalIndexedDb;
});

/** 等本地库的异步写入落定。 */
async function settle() {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function textOf(doc: Y.Doc) {
  return doc.getText("t").toString();
}

describe("openLocalNoteStore", () => {
  it("记录文档的每次更新，下次打开同一篇笔记时载入", async () => {
    const first = new Y.Doc();
    const store = await openLocalNoteStore(1, first);
    expect(store.available).toBe(true);
    expect(await store.load()).toBe(false);

    first.getText("t").insert(0, "离线写的字");
    await settle();
    store.destroy();

    const second = new Y.Doc();
    const reopened = await openLocalNoteStore(1, second);
    expect(await reopened.load()).toBe(true);
    expect(textOf(second)).toBe("离线写的字");
  });

  it("载入本地副本的更新以自己的 origin 标记，调用方据此不把它当本地编辑", async () => {
    const seeded = new Y.Doc();
    const seedStore = await openLocalNoteStore(2, seeded);
    await seedStore.load();
    seeded.getText("t").insert(0, "x");
    await settle();
    seedStore.destroy();

    const doc = new Y.Doc();
    const store = await openLocalNoteStore(2, doc);
    const origins: unknown[] = [];
    doc.on("update", (_update: Uint8Array, origin: unknown) => origins.push(origin));
    await store.load();

    expect(origins).toEqual([store.origin]);
  });

  it("启用前文档里已有的内容在载入时一并存下", async () => {
    const doc = new Y.Doc();
    doc.getText("t").insert(0, "启用前同步到的正文");
    const store = await openLocalNoteStore(3, doc);
    await store.load();
    await settle();
    store.destroy();

    const reopened = new Y.Doc();
    await (await openLocalNoteStore(3, reopened)).load();
    expect(textOf(reopened)).toBe("启用前同步到的正文");
  });

  it("读写谱系", async () => {
    const store = await openLocalNoteStore(4, new Y.Doc());
    expect(await store.getEpoch()).toBeNull();
    await store.setEpoch("7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f");
    expect(await store.getEpoch()).toBe("7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f");
  });

  it("更新条数超过阈值时合并成全量状态，内容不变", async () => {
    const doc = new Y.Doc();
    const store = await openLocalNoteStore(5, doc);
    await store.load();
    for (let index = 0; index < LOCAL_NOTE_COMPACT_THRESHOLD + 5; index += 1) {
      doc.getText("t").insert(doc.getText("t").length, "a");
    }
    await settle();
    await settle();
    store.destroy();

    const reopened = new Y.Doc();
    await (await openLocalNoteStore(5, reopened)).load();
    expect(textOf(reopened)).toBe("a".repeat(LOCAL_NOTE_COMPACT_THRESHOLD + 5));
  });

  it("clear 删除这篇笔记的本地库", async () => {
    const doc = new Y.Doc();
    const store = await openLocalNoteStore(6, doc);
    await store.load();
    doc.getText("t").insert(0, "要被删掉");
    await settle();
    await store.clear();

    const reopened = new Y.Doc();
    expect(await (await openLocalNoteStore(6, reopened)).load()).toBe(false);
  });

  it("IndexedDB 不可用时返回停用状态，不抛错", async () => {
    // @ts-expect-error 模拟无痕模式等不支持 IndexedDB 的环境
    globalThis.indexedDB = undefined;
    const store = await openLocalNoteStore(7, new Y.Doc());
    expect(store.available).toBe(false);
    expect(await store.load()).toBe(false);
  });

  it("打开失败时停用", async () => {
    const factory = new IDBFactory();
    vi.spyOn(factory, "open").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });
    globalThis.indexedDB = factory;
    const store = await openLocalNoteStore(8, new Y.Doc());
    expect(store.available).toBe(false);
  });

  it("写入失败（配额不足等）时停用并通知监听者", async () => {
    const doc = new Y.Doc();
    const store = await openLocalNoteStore(9, doc);
    await store.load();
    const disabled = vi.fn();
    store.onDisabled(disabled);
    vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    doc.getText("t").insert(0, "写不进去");
    await settle();

    expect(store.available).toBe(false);
    expect(disabled).toHaveBeenCalledOnce();
  });
});

describe("本地库的清理", () => {
  it("打开过的笔记记入索引；deleteLocalNote 删除库并移出索引", async () => {
    await openLocalNoteStore(10, new Y.Doc());
    expect(hasLocalNote(10)).toBe(true);
    await deleteLocalNote(10);
    expect(hasLocalNote(10)).toBe(false);
  });

  it("退出登录时删除全部笔记本地库", async () => {
    for (const id of [11, 12]) {
      const doc = new Y.Doc();
      const store = await openLocalNoteStore(id, doc);
      await store.load();
      doc.getText("t").insert(0, `笔记 ${id}`);
      await settle();
      store.destroy();
    }

    await clearAllLocalNotes();

    expect(hasLocalNote(11)).toBe(false);
    const reopened = new Y.Doc();
    expect(await (await openLocalNoteStore(11, reopened)).load()).toBe(false);
  });

  it("超过保留期没打开过的本地库被清理，近期打开的保留", async () => {
    await openLocalNoteStore(13, new Y.Doc());
    await openLocalNoteStore(14, new Y.Doc());
    const index = JSON.parse(window.localStorage.getItem("anynote-note-cache-index") ?? "{}");
    index["13"] = Date.now() - LOCAL_NOTE_RETENTION_MS - 1_000;
    window.localStorage.setItem("anynote-note-cache-index", JSON.stringify(index));

    expect(await pruneStaleLocalNotes()).toBe(1);
    expect(hasLocalNote(13)).toBe(false);
    expect(hasLocalNote(14)).toBe(true);
  });
});
