"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useQuery } from "@tanstack/react-query";
import { noteQueryKeys } from "./query-keys";
import { type NoteDetail, noteDetailSchema } from "./schemas";

/**
 * 笔记详情。
 *
 * 编辑器会把它当作初始内容，自动保存期间不允许后台刷新覆盖正在编辑的正文，
 * 因此关掉 `refetchOnMount` 之外的所有自动重取，只在显式失效时才重新拉取。
 */
export function useNoteQuery(noteId: number) {
  return useQuery({
    queryKey: noteQueryKeys.detail(noteId),
    enabled: Number.isFinite(noteId) && noteId > 0,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<NoteDetail> => {
      const { response } = await noteApi.GET("/notes/{noteId}", {
        params: { path: { noteId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, noteDetailSchema.parse);
    },
  });
}
