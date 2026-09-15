import type { NoteListParams } from "./schemas";

// 层级 query key：域 key 是所有子 key 的前缀，保证「整域失效」与「单条失效」都能精确命中。
export const noteQueryKeys = {
  all: ["notes"] as const,
  bases: ["notes", "bases"] as const,
  baseList: (permissions: number) => ["notes", "bases", "list", permissions] as const,
  baseDetail: (baseId: number) => ["notes", "bases", "detail", baseId] as const,
  /** 组织知识库单独一棵子树：端点与过滤条件都不同（`type=1` + 数据范围）。 */
  organizationBases: ["notes", "bases", "organizations"] as const,
  /** 「我的」分段：我管理的知识库（`/bases/managerList`）。 */
  managedBases: (userId: number, organizationId: number) =>
    ["notes", "bases", "managed", userId, organizationId] as const,
  /**
   * 知识库成员：UI 重设计的「成员」Tab。
   *
   * `username` 参与 key（12.2.6）：带关键词的搜索是**另一个结果集**而不是同一份
   * 数据的本地切片，不放进 key 就会命中旧缓存、切换关键词看到的还是上一个列表。
   * `baseMembersRoot` 是整棵子树，移除成员后按它失效（一个人可能出现在多个关键词下）。
   */
  baseMembersRoot: ["notes", "bases", "members"] as const,
  baseMembers: (baseId: number, username: string) =>
    ["notes", "bases", "members", baseId, username] as const,
  lists: ["notes", "list"] as const,
  list: (params: NoteListParams) => ["notes", "list", params] as const,
  detail: (noteId: number) => ["notes", "detail", noteId] as const,
  /** 知识库「资料」Tab：按知识库过滤的文档列表。 */
  docList: (baseId: number) => ["notes", "docs", "list", baseId] as const,
  /**
   * 笔记历史版本列表（D-16 右侧面板）。
   *
   * 单独一棵 `history` 子树而不是挂在 `detail` 下：列表按 `noteId` 分页、
   * 内容按 `operationId` 取，两者是不同端点、不同维度，混在一起就没法
   * 只失效其中一个（恢复后要延迟失效列表但保留已看过的版本内容）。
   */
  historyList: (noteId: number) => ["notes", "history", "list", noteId] as const,
  historyDetail: (operationId: number) => ["notes", "history", "detail", operationId] as const,
};
