"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { taskQueryKeys } from "./query-keys";
import { type MemberTask, memberTaskPageSchema, submitTaskSchema } from "./schemas";

export const TASK_PAGE_SIZE = 50;

/** 我的任务列表（GET /noteTasks，knowledgeBaseId 必填：任务按知识库组织）。 */
export function useTasksQuery(knowledgeBaseId: number, page = 1) {
  return useQuery({
    queryKey: taskQueryKeys.list(knowledgeBaseId, page),
    enabled: Number.isSafeInteger(knowledgeBaseId) && knowledgeBaseId > 0,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<{ rows: MemberTask[]; total: number; pages: number }> => {
      const { response } = await noteApi.GET("/noteTasks", {
        params: { query: { page, pageSize: TASK_PAGE_SIZE, knowledgeBaseId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const pageData = await unwrapEnvelope(response, memberTaskPageSchema.parse);
      return {
        rows: pageData.rows,
        total: pageData.total ?? pageData.rows.length,
        pages: pageData.pages ?? 1,
      };
    },
  });
}

/** 提交任务：把一篇笔记作为任务成果提交（POST /noteTasks/submit）。 */
export function useSubmitTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, noteTaskId }: { noteId: number; noteTaskId: number }) => {
      const parsed = submitTaskSchema.parse({ noteId, noteTaskId });
      const { response } = await noteApi.POST("/noteTasks/submit", {
        body: parsed,
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, () => undefined);
    },
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
    },
  });
}
