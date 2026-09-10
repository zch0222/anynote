import { describe, expect, it } from "vitest";
import { authQueryKeys } from "./auth/query-keys";
import { noteQueryKeys } from "./notes/query-keys";

// query key 是缓存失效的契约：任何调整都会让既有缓存与失效逻辑失配，必须显式变更。
describe("query key 稳定性", () => {
  it("auth 域 key 与既定层级一致", () => {
    expect(authQueryKeys.all).toEqual(["auth"]);
    expect(authQueryKeys.me).toEqual(["auth", "me"]);
    // 域 key 必须是 detail key 的前缀，保证按域整体失效可用
    expect(authQueryKeys.me.slice(0, authQueryKeys.all.length)).toEqual(authQueryKeys.all);
  });

  it("notes 域 key 与既定层级一致", () => {
    expect(noteQueryKeys.all).toEqual(["notes"]);
    expect(noteQueryKeys.bases).toEqual(["notes", "bases"]);
    expect(noteQueryKeys.baseList(4)).toEqual(["notes", "bases", "list", 4]);
    expect(noteQueryKeys.baseDetail(7)).toEqual(["notes", "bases", "detail", 7]);
    expect(noteQueryKeys.lists).toEqual(["notes", "list"]);
    expect(noteQueryKeys.list({ knowledgeBaseId: 1, page: 2, pageSize: 20 })).toEqual([
      "notes",
      "list",
      { knowledgeBaseId: 1, page: 2, pageSize: 20 },
    ]);
    expect(noteQueryKeys.detail(42)).toEqual(["notes", "detail", 42]);
    // 前缀关系：域 key 必须能覆盖 bases / 列表 / 详情三棵子树
    for (const key of [
      noteQueryKeys.bases,
      noteQueryKeys.baseList(4),
      noteQueryKeys.baseDetail(7),
      noteQueryKeys.lists,
      noteQueryKeys.list({ knowledgeBaseId: 1, page: 1, pageSize: 20 }),
      noteQueryKeys.detail(42),
    ]) {
      expect(key.slice(0, noteQueryKeys.all.length)).toEqual(noteQueryKeys.all);
    }
  });
});
