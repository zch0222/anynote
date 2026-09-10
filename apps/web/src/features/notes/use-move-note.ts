"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { noteQueryKeys } from "./query-keys";
import { type NoteSaveResult, noteSaveResultSchema } from "./schemas";

export type MoveNoteInput = { noteId: number; knowledgeBaseId: number };

/**
 * 把笔记移动到另一个知识库。
 *
 * 走的是同一个 PATCH 端点，只带 knowledgeBaseId；目标知识库的编辑权限由后端校验，
 * 没有权限会返回 A0301。移动不带 version：它不改正文，与自动保存不构成内容冲突。
 */
export function useMoveNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, knowledgeBaseId }: MoveNoteInput): Promise<NoteSaveResult> => {
      const { response } = await noteApi.PATCH("/notes/{noteId}", {
        params: { path: { noteId } },
        body: { knowledgeBaseId },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, noteSaveResultSchema.parse);
    },
    onSuccess: (_result, { noteId }) => {
      queryClient.removeQueries({ queryKey: noteQueryKeys.detail(noteId) });
      return queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists });
    },
    retry: false,
  });
}
