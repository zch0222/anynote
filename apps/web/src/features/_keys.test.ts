import { describe, expect, it } from "vitest";
import { aiQueryKeys } from "./ai/query-keys";
import { authQueryKeys } from "./auth/query-keys";
import { moocQueryKeys } from "./mooc/query-keys";
import { noteQueryKeys } from "./notes/query-keys";
import { taskQueryKeys } from "./tasks/query-keys";

// query key 是缓存失效的契约：任何调整都会让既有缓存与失效逻辑失配，必须显式变更。
describe("query key 稳定性", () => {
  it("ai 域 key 与既定层级一致", () => {
    expect(aiQueryKeys.all).toEqual(["ai"]);
    expect(aiQueryKeys.conversationList(20)).toEqual(["ai", "conversations", "list", 20]);
    expect(aiQueryKeys.conversationDetail(7)).toEqual(["ai", "conversations", "detail", 7]);
    expect(aiQueryKeys.docList(3)).toEqual(["ai", "docs", "list", 3]);
    expect(aiQueryKeys.docDetail(5)).toEqual(["ai", "docs", "detail", 5]);
    for (const key of [
      aiQueryKeys.conversationList(20),
      aiQueryKeys.conversationDetail(7),
      aiQueryKeys.docList(3),
      aiQueryKeys.docDetail(5),
    ]) {
      expect(key.slice(0, aiQueryKeys.all.length)).toEqual(aiQueryKeys.all);
    }
  });

  it("mooc / tasks 域 key 与既定层级一致", () => {
    expect(moocQueryKeys.all).toEqual(["mooc"]);
    expect(moocQueryKeys.list(4)).toEqual(["mooc", "list", 4]);
    expect(moocQueryKeys.items(8, 0)).toEqual(["mooc", "items", 8, 0]);
    expect(moocQueryKeys.itemDetail(8, 2)).toEqual(["mooc", "item", 8, 2]);
    expect(taskQueryKeys.all).toEqual(["tasks"]);
    expect(taskQueryKeys.list(5, 1)).toEqual(["tasks", "list", 5, 1]);
    for (const key of [
      moocQueryKeys.list(4),
      moocQueryKeys.items(8, 0),
      moocQueryKeys.itemDetail(8, 2),
    ]) {
      expect(key.slice(0, moocQueryKeys.all.length)).toEqual(moocQueryKeys.all);
    }
    expect(taskQueryKeys.list(5, 1).slice(0, taskQueryKeys.all.length)).toEqual(taskQueryKeys.all);
  });

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
