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
 * 翻页时用 `keepPreviousData` 保住上一页，避免列表在请求间闪成空白。
 */
export function useNotesQuery(params: NoteListParams) {
  return useQuery({
    queryKey: noteQueryKeys.list(params),
    enabled: Number.isFinite(params.knowledgeBaseId) && params.knowledgeBaseId > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<NotePage> => {
      const { response } = await noteApi.GET("/notes", {
        params: {
          query: {
            page: params.page,
            pageSize: params.pageSize,
            knowledgeBaseId: params.knowledgeBaseId,
          },
        },
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
