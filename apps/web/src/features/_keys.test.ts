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
    // 课程详情单独一棵：改课程名不该把整库列表一起作废
    expect(moocQueryKeys.detail(8)).toEqual(["mooc", "detail", 8]);
    expect(moocQueryKeys.items(8, 0)).toEqual(["mooc", "items", 8, 0]);
    expect(moocQueryKeys.itemDetail(8, 2)).toEqual(["mooc", "item", 8, 2]);
    for (const key of [
      moocQueryKeys.list(4),
      moocQueryKeys.detail(8),
      moocQueryKeys.items(8, 0),
      moocQueryKeys.itemDetail(8, 2),
    ]) {
      expect(key.slice(0, moocQueryKeys.all.length)).toEqual(moocQueryKeys.all);
    }
  });

  it("tasks 域 key 与既定层级一致", () => {
    expect(taskQueryKeys.all).toEqual(["tasks"]);
    expect(taskQueryKeys.list(5, 1)).toEqual(["tasks", "list", 5, 1]);
    // 管理员详情 / 提交记录 / 热力图三棵子树互不覆盖：退回一份提交只该动前两棵
    expect(taskQueryKeys.adminDetail(9)).toEqual(["tasks", "admin", "detail", 9]);
    expect(taskQueryKeys.submissions(9, "returned", 2)).toEqual([
      "tasks",
      "admin",
      "submissions",
      9,
      "returned",
      2,
    ]);
    // 整棵提交记录子树必须是逐 tab key 的前缀，退回后一次失效三个 tab
    expect(
      taskQueryKeys.submissions(9, "submitted", 1).slice(0, taskQueryKeys.submissionsAll(9).length),
    ).toEqual(taskQueryKeys.submissionsAll(9));
    expect(taskQueryKeys.heatmap(9)).toEqual(["tasks", "admin", "heatmap", 9]);
    // 时间线是成员视角的，与 admin 子树分开：失效管理员数据不该动它
    expect(taskQueryKeys.timeline(9)).toEqual(["tasks", "timeline", 9]);
    for (const key of [
      taskQueryKeys.list(5, 1),
      taskQueryKeys.adminDetail(9),
      taskQueryKeys.submissions(9, "pending", 1),
      taskQueryKeys.submissionsAll(9),
      taskQueryKeys.heatmap(9),
      taskQueryKeys.timeline(9),
    ]) {
      expect(key.slice(0, taskQueryKeys.all.length)).toEqual(taskQueryKeys.all);
    }
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
    // 成员 key 带上搜索词：不同关键词是不同的结果集，不能共用同一条缓存
    expect(noteQueryKeys.baseMembers(7, "")).toEqual(["notes", "bases", "members", 7, ""]);
    expect(noteQueryKeys.baseMembers(7, "zhou")).toEqual(["notes", "bases", "members", 7, "zhou"]);
    expect(
      noteQueryKeys.baseMembers(7, "zhou").slice(0, noteQueryKeys.baseMembersRoot.length),
    ).toEqual(noteQueryKeys.baseMembersRoot);
    expect(noteQueryKeys.lists).toEqual(["notes", "list"]);
    expect(noteQueryKeys.list({ knowledgeBaseId: 1, page: 2, pageSize: 20 })).toEqual([
      "notes",
      "list",
      { knowledgeBaseId: 1, page: 2, pageSize: 20 },
    ]);
    expect(noteQueryKeys.detail(42)).toEqual(["notes", "detail", 42]);
    // 历史版本：列表按 noteId、内容按 operationId，两棵子树各自独立
    expect(noteQueryKeys.historyList(42)).toEqual(["notes", "history", "list", 42]);
    expect(noteQueryKeys.historyDetail(901)).toEqual(["notes", "history", "detail", 901]);
    // 前缀关系：域 key 必须能覆盖 bases / 列表 / 详情 / 历史四棵子树
    for (const key of [
      noteQueryKeys.bases,
      noteQueryKeys.baseList(4),
      noteQueryKeys.baseDetail(7),
      noteQueryKeys.lists,
      noteQueryKeys.list({ knowledgeBaseId: 1, page: 1, pageSize: 20 }),
      noteQueryKeys.detail(42),
      noteQueryKeys.historyList(42),
      noteQueryKeys.historyDetail(901),
    ]) {
      expect(key.slice(0, noteQueryKeys.all.length)).toEqual(noteQueryKeys.all);
    }
  });

  it("历史版本的列表 key 与详情 key 前缀不同，失效列表不会连带清掉已读的版本内容", () => {
    // 恢复成功后只延迟失效列表；两者若共用前缀就会把版本正文一起清掉，
    // 面板重取时用户正在看的那一版会闪回骨架。
    const list = noteQueryKeys.historyList(42);
    const detail = noteQueryKeys.historyDetail(901);
    expect(detail.slice(0, list.length)).not.toEqual(list);
  });
});
