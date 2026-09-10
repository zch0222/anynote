"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { noteQueryKeys } from "./query-keys";

/** 新建笔记，返回新笔记 id；调用方据此跳转到编辑页。 */
export function useCreateNoteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { knowledgeBaseId: number; title: string }): Promise<number> => {
      const { response } = await noteApi.POST("/notes", {
        body: { knowledgeBaseId: input.knowledgeBaseId, title: input.title },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, z.number().parse);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists }),
    retry: false,
  });
}
