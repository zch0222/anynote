import {
  COLLAB_INDEX_KEY,
  type CollabDocMeta,
  appendDocEntry,
  collabDocMetaSchema,
  readDocIndex,
  removeDocEntry,
  renameDocEntry,
  touchDocEntry,
} from "@/lib/collab/index-doc";
import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

let doc: Y.Doc;

function meta(overrides: Partial<CollabDocMeta> = {}): CollabDocMeta {
  return {
    id: "abcdefgh",
    title: "设计稿评审",
    createdAt: 1_000,
    updatedAt: 1_000,
    createdBy: "小明",
    ...overrides,
  };
}

beforeEach(() => {
  doc = new Y.Doc();
});

describe("readDocIndex", () => {
  it("空索引返回空列表", () => {
    expect(readDocIndex(doc)).toEqual([]);
  });

  it("按更新时间倒序返回", () => {
    appendDocEntry(doc, meta({ id: "aaaaaaaa", updatedAt: 100 }));
    appendDocEntry(doc, meta({ id: "cccccccc", updatedAt: 300 }));
    appendDocEntry(doc, meta({ id: "bbbbbbbb", updatedAt: 200 }));

    expect(readDocIndex(doc).map((item) => item.id)).toEqual(["cccccccc", "bbbbbbbb", "aaaaaaaa"]);
  });

  it("跳过结构不合法的条目而不是整体报错", () => {
    appendDocEntry(doc, meta({ id: "aaaaaaaa" }));
    // 其他端写进来的脏数据：缺字段、id 不合法、标题超长
    const list = doc.getArray<Y.Map<unknown>>(COLLAB_INDEX_KEY);
    const broken = new Y.Map<unknown>();
    broken.set("id", "x");
    list.push([broken]);
    const noTitle = new Y.Map<unknown>();
    noTitle.set("id", "bbbbbbbb");
    list.push([noTitle]);

    expect(readDocIndex(doc).map((item) => item.id)).toEqual(["aaaaaaaa"]);
  });
});

describe("appendDocEntry", () => {
  it("写入的条目能被原样读回", () => {
    const entry = meta();
    appendDocEntry(doc, entry);
    expect(readDocIndex(doc)).toEqual([entry]);
  });

  it("同 id 重复追加是空操作", () => {
    appendDocEntry(doc, meta());
    appendDocEntry(doc, meta({ title: "另一个标题" }));
    expect(readDocIndex(doc)).toHaveLength(1);
    expect(readDocIndex(doc)[0]?.title).toBe("设计稿评审");
  });

  it("schema 拒绝非法 id 与超长标题（写入前由调用方校验）", () => {
    expect(collabDocMetaSchema.safeParse(meta({ id: "short" })).success).toBe(false);
    expect(collabDocMetaSchema.safeParse(meta({ title: "标".repeat(61) })).success).toBe(false);
    expect(collabDocMetaSchema.safeParse(meta({ title: "" })).success).toBe(false);
  });
});

describe("renameDocEntry / touchDocEntry", () => {
  it("改名同时刷新 updatedAt", () => {
    appendDocEntry(doc, meta());
    expect(renameDocEntry(doc, "abcdefgh", "新标题", 5_000)).toBe(true);
    expect(readDocIndex(doc)[0]).toMatchObject({ title: "新标题", updatedAt: 5_000 });
  });

  it("touch 只改 updatedAt，不动标题", () => {
    appendDocEntry(doc, meta());
    expect(touchDocEntry(doc, "abcdefgh", 7_000)).toBe(true);
    expect(readDocIndex(doc)[0]).toMatchObject({ title: "设计稿评审", updatedAt: 7_000 });
  });

  it("文档不存在时返回 false 且不产生条目", () => {
    expect(renameDocEntry(doc, "missing0", "x")).toBe(false);
    expect(touchDocEntry(doc, "missing0")).toBe(false);
    expect(readDocIndex(doc)).toEqual([]);
  });
});

describe("removeDocEntry", () => {
  it("移除指定条目，其余保留", () => {
    appendDocEntry(doc, meta({ id: "aaaaaaaa" }));
    appendDocEntry(doc, meta({ id: "bbbbbbbb" }));

    expect(removeDocEntry(doc, "aaaaaaaa")).toBe(true);
    expect(readDocIndex(doc).map((item) => item.id)).toEqual(["bbbbbbbb"]);
  });

  it("移除不存在的条目返回 false", () => {
    expect(removeDocEntry(doc, "missing0")).toBe(false);
  });
});

describe("多端收敛", () => {
  it("两端各自新建后互相同步，两条都在", () => {
    const other = new Y.Doc();
    appendDocEntry(doc, meta({ id: "aaaaaaaa", updatedAt: 100 }));
    appendDocEntry(other, meta({ id: "bbbbbbbb", updatedAt: 200 }));

    // 交换更新，模拟经协同服务广播后的状态
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other));
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));

    expect(readDocIndex(doc).map((item) => item.id)).toEqual(["bbbbbbbb", "aaaaaaaa"]);
    expect(readDocIndex(other)).toEqual(readDocIndex(doc));
  });

  it("一端改名、另一端 touch，合并后标题与时间都不丢", () => {
    appendDocEntry(doc, meta());
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));

    renameDocEntry(doc, "abcdefgh", "甲改的标题", 3_000);
    touchDocEntry(other, "abcdefgh", 4_000);

    Y.applyUpdate(doc, Y.encodeStateAsUpdate(other));
    Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));

    expect(readDocIndex(doc)).toEqual(readDocIndex(other));
    expect(readDocIndex(doc)[0]?.title).toBe("甲改的标题");
  });
});
