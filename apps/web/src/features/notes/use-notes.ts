"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { noteQueryKeys } from "./query-keys";
import {
  DEFAULT_PAGE_SIZE,
  type NoteListItem,
  type NoteListParams,
  noteListItemSchema,
  pageBeanSchema,
} from "./schemas";

const notePageSchema = pageBeanSchema(noteListItemSchema);

export type NotePage = {
  rows: NoteListItem[];
  total: number;
  pages: number;
  current: number;
};

/**
 * 知识库内的笔记分页列表。
 *
 * **端点必须用 `POST /notes/bases/{baseId}`，不能用 `GET /notes`**——这是正确性问题，
 * 不是风格选择：`GET /notes`（`selectNoteList`）的 FROM 子句是 `n_note_operation_log`，
 * 只有**产生过操作日志**的笔记才会出现在结果里，而 `createNote` 只投递
 * `GENERATOR_NOTE_INDEX`、不写操作日志。于是"新建后还没编辑过"的笔记在这条查询下
 * 恒不可见，用户看到的现象就是"新建成功了，但知识库里没有"。
 * `POST /notes/bases/{baseId}`（`selectNoteInfoList`）的 FROM 是 `n_note`，
 * 新建的笔记立刻可见，这也是 legacy 前端 `useNoteList` 一直用的端点。
 *
 * 两条端点分工是有意的、不是重复实现：`GET /notes` 的语义是"我最近操作过的笔记"
 * （CLI 的 `note recent` 正是靠它），本库全量列表走这一条。
 *
 * 翻页时用 `keepPreviousData` 保住上一页，避免列表在请求间闪成空白。
 */
export function useNotesQuery(params: NoteListParams) {
  return useQuery({
    queryKey: noteQueryKeys.list(params),
    enabled: Number.isFinite(params.knowledgeBaseId) && params.knowledgeBaseId > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<NotePage> => {
      const { response } = await noteApi.POST("/notes/bases/{baseId}", {
        params: { path: { baseId: params.knowledgeBaseId } },
        // 知识库以路径为准（后端 `queryParam.setKnowledgeBaseId(baseId)` 会覆盖请求体），
        // 请求体只带分页，避免两处 id 不一致时不知道该信哪个
        body: { page: params.page, pageSize: params.pageSize },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, notePageSchema.parse);
      return {
        rows: page.rows,
        total: page.total ?? page.rows.length,
        pages: page.pages ?? 1,
        current: page.current ?? params.page,
      };
    },
  });
}

export { DEFAULT_PAGE_SIZE };
