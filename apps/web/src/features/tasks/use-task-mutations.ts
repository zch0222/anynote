"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { taskQueryKeys } from "./query-keys";
import { taskFormSchema } from "./schemas";

/** `POST /admin/noteTasks` 的返回值（`CreateResEntity`）就是新任务 id。 */
const createResEntitySchema = z.object({ id: z.number().nullish() });

export type CreateTaskInput = {
  taskName: string;
  startTime: Date;
  endTime: Date;
  taskDescribe: string;
  knowledgeBaseId: number;
};

export type UpdateTaskInput = {
  taskId: number;
  taskName: string;
  startTime: Date;
  endTime: Date;
  taskDescribe: string;
};

/**
 * 表单值 → 请求体。
 *
 * 时间统一 `toISOString()`：`NoteTaskCreateDTO` / `NoteTaskUpdateDTO` 是
 * `date-time` 字符串，旧前端用 dayjs 序列化出来的也是同一形态的 UTC ISO 串，
 * 后端按同一口径解析，两边不会差出时区偏移。
 *
 * `taskFormSchema` 再校验一次：`Date` 类型经网络层与乐观更新都不该被改坏，
 * 而且 `taskDescribe` 为空串时后端要的是 `undefined`（选填字段传空串会被
 * 当成"清空描述"，语义虽然一样，但契约字段是可选）。
 */
function toIsoBody(input: {
  taskName: string;
  startTime: Date;
  endTime: Date;
  taskDescribe: string;
}): { taskName: string; startTime: string; endTime: string; taskDescribe: string } {
  const parsed = taskFormSchema.parse({
    taskName: input.taskName,
    startTime: input.startTime,
    endTime: input.endTime,
    taskDescribe: input.taskDescribe,
  });
  return {
    taskName: parsed.taskName,
    startTime: parsed.startTime.toISOString(),
    endTime: parsed.endTime.toISOString(),
    taskDescribe: parsed.taskDescribe,
  };
}

/** 发布任务（`POST /admin/noteTasks`）。成功后返回新任务 id，供跳详情用。 */
export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskInput): Promise<{ id: number }> => {
      const { response } = await noteApi.POST("/admin/noteTasks", {
        body: { ...toIsoBody(input), knowledgeBaseId: input.knowledgeBaseId },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const created = await unwrapEnvelope(response, createResEntitySchema.parse);
      if (!created.id) {
        // 没有 id 就跳不了详情页；把"服务端没按契约返回"当成失败抛出去，
        // 否则用户看到"任务已发布"却停在原地。
        throw new Error("任务已创建，但没有拿到任务 id，请到任务列表查看");
      }
      return { id: created.id };
    },
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
    },
  });
}

/** 修改任务（`PATCH /admin/noteTasks/{id}`）。 */
export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, ...input }: UpdateTaskInput): Promise<void> => {
      const { response } = await noteApi.PATCH("/admin/noteTasks/{id}", {
        params: { path: { id: taskId } },
        body: toIsoBody(input),
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      await unwrapEnvelope(response, () => undefined);
    },
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
    },
  });
}

/**
 * 退回一份提交（`POST /admin/noteTasks/submissions/return/{id}`）。
 *
 * 失效范围刻意收窄到**这个任务**的提交记录与详情：
 * 退回会让那一行从「已提交」移到「已退回」，两个 tab 的计数都变，
 * 所以要失效整棵 `submissions` 子树而不是当前页那一条；
 * 详情里的 `submittedCount` 也会变，一起失效。
 * 但不失效整个 tasks 域——任务列表（成员视角的 `submissionStatus`）
 * 与我们无关，多失效一次就是白刷一遍所有列表。
 */
export function useReturnSubmissionMutation(taskId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (submissionId: number): Promise<void> => {
      const { response } = await noteApi.POST("/admin/noteTasks/submissions/return/{id}", {
        params: { path: { id: submissionId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      await unwrapEnvelope(response, () => undefined);
    },
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.submissionsAll(taskId) });
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.adminDetail(taskId) });
    },
  });
}
