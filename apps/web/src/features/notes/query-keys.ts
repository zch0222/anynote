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
  /** 知识库成员：UI 重设计的「成员」Tab。 */
  baseMembers: (baseId: number) => ["notes", "bases", "members", baseId] as const,
  lists: ["notes", "list"] as const,
  list: (params: NoteListParams) => ["notes", "list", params] as const,
  detail: (noteId: number) => ["notes", "detail", noteId] as const,
  /** 知识库「资料」Tab：按知识库过滤的文档列表。 */
  docList: (baseId: number) => ["notes", "docs", "list", baseId] as const,
};
