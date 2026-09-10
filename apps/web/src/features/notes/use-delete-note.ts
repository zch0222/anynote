"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { noteQueryKeys } from "./query-keys";

/** 删除笔记；成功后清掉详情缓存并让所有列表重取。 */
export function useDeleteNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: number): Promise<void> => {
      const { response } = await noteApi.DELETE("/notes/{noteId}", {
        params: { path: { noteId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      await unwrapEnvelope(response, z.unknown().parse);
    },
    onSuccess: (_result, noteId) => {
      queryClient.removeQueries({ queryKey: noteQueryKeys.detail(noteId) });
      return queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists });
    },
    retry: false,
  });
}
