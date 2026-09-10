import type { NoteListParams } from "./schemas";

// 层级 query key：域 key 是所有子 key 的前缀，保证「整域失效」与「单条失效」都能精确命中。
export const noteQueryKeys = {
  all: ["notes"] as const,
  bases: ["notes", "bases"] as const,
  baseList: (permissions: number) => ["notes", "bases", "list", permissions] as const,
  baseDetail: (baseId: number) => ["notes", "bases", "detail", baseId] as const,
  lists: ["notes", "list"] as const,
  list: (params: NoteListParams) => ["notes", "list", params] as const,
  detail: (noteId: number) => ["notes", "detail", noteId] as const,
};
