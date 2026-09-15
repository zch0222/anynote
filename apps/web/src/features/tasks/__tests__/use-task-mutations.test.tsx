import { taskQueryKeys } from "@/features/tasks/query-keys";
import {
  useCreateTaskMutation,
  useReturnSubmissionMutation,
  useUpdateTaskMutation,
} from "@/features/tasks/use-task-mutations";
import { ApiError } from "@/lib/api/errors";
import { createTestQueryClient, renderHookWithProviders } from "@/test/render";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({ noteApi: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));

import { noteApi } from "@/lib/api/openapi";

const noteApiMock = vi.mocked(noteApi, true);

function envelope(data: unknown, code = "00000"): { response: Response } {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), { status: 200 }),
  };
}

function failure(code: string, msg: string): { response: Response } {
  return { response: new Response(JSON.stringify({ code, msg }), { status: 200 }) };
}

const START = new Date("2026-09-10T10:00:00.000Z");
const END = new Date("2026-09-17T15:59:00.000Z");

describe("use-task-mutations", () => {
  beforeEach(() => {
    noteApiMock.POST.mockReset();
    noteApiMock.PATCH.mockReset();
  });

  it("useCreateTaskMutation：时间转 ISO 串、带上 knowledgeBaseId，返回新 id", async () => {
    noteApiMock.POST.mockResolvedValue(envelope({ id: 42 }));
    const { result } = renderHookWithProviders(() => useCreateTaskMutation());

    const created = await result.current.mutateAsync({
      taskName: "读书笔记",
      startTime: START,
      endTime: END,
      taskDescribe: "写一篇读后感",
      knowledgeBaseId: 5,
    });

    expect(created).toEqual({ id: 42 });
    expect(noteApiMock.POST).toHaveBeenCalledWith("/admin/noteTasks", {
      body: {
        taskName: "读书笔记",
        startTime: START.toISOString(),
        endTime: END.toISOString(),
        taskDescribe: "写一篇读后感",
        knowledgeBaseId: 5,
      },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
  });

  it("useCreateTaskMutation：非法表单（空名称 / 截止早于开始）在客户端就被拒，不发请求", async () => {
    const { result } = renderHookWithProviders(() => useCreateTaskMutation());

    await expect(
      result.current.mutateAsync({
        taskName: "   ",
        startTime: START,
        endTime: END,
        taskDescribe: "",
        knowledgeBaseId: 5,
      }),
    ).rejects.toThrow("请填写任务名称");

    await expect(
      result.current.mutateAsync({
        taskName: "读书笔记",
        startTime: END,
        endTime: START,
        taskDescribe: "",
        knowledgeBaseId: 5,
      }),
    ).rejects.toThrow("截止时间必须晚于开始时间");

    expect(noteApiMock.POST).not.toHaveBeenCalled();
  });

  it("useCreateTaskMutation：业务错误原样抛出（页面据此 toast 后端原因）", async () => {
    noteApiMock.POST.mockResolvedValue(failure("A0160", "任务名称不能为空"));
    const { result } = renderHookWithProviders(() => useCreateTaskMutation());

    await expect(
      result.current.mutateAsync({
        taskName: "读书笔记",
        startTime: START,
        endTime: END,
        taskDescribe: "",
        knowledgeBaseId: 5,
      }),
    ).rejects.toThrow("任务名称不能为空");
  });

  it("useCreateTaskMutation：后端没返回 id 时报错而不是假装成功", async () => {
    noteApiMock.POST.mockResolvedValue(envelope({}));
    const { result } = renderHookWithProviders(() => useCreateTaskMutation());

    await expect(
      result.current.mutateAsync({
        taskName: "读书笔记",
        startTime: START,
        endTime: END,
        taskDescribe: "",
        knowledgeBaseId: 5,
      }),
    ).rejects.toThrow(/没有拿到任务 id/);
  });

  it("useCreateTaskMutation：成功后失效 tasks 域", async () => {
    noteApiMock.POST.mockResolvedValue(envelope({ id: 42 }));
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHookWithProviders(() => useCreateTaskMutation(), { queryClient });

    await result.current.mutateAsync({
      taskName: "读书笔记",
      startTime: START,
      endTime: END,
      taskDescribe: "",
      knowledgeBaseId: 5,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskQueryKeys.all });
  });

  it("useUpdateTaskMutation：PATCH 带路径 id，body 不含 knowledgeBaseId（接口不接受改库）", async () => {
    noteApiMock.PATCH.mockResolvedValue(envelope("SUCCESS"));
    const { result } = renderHookWithProviders(() => useUpdateTaskMutation());

    await result.current.mutateAsync({
      taskId: 9,
      taskName: "读书笔记（改）",
      startTime: START,
      endTime: END,
      taskDescribe: "",
    });

    expect(noteApiMock.PATCH).toHaveBeenCalledWith("/admin/noteTasks/{id}", {
      params: { path: { id: 9 } },
      body: {
        taskName: "读书笔记（改）",
        startTime: START.toISOString(),
        endTime: END.toISOString(),
        taskDescribe: "",
      },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
  });

  it("useUpdateTaskMutation：21 字名称在客户端被拦下（PATCH 限 1–20 字）", async () => {
    const { result } = renderHookWithProviders(() => useUpdateTaskMutation());

    await expect(
      result.current.mutateAsync({
        taskId: 9,
        taskName: "字".repeat(21),
        startTime: START,
        endTime: END,
        taskDescribe: "",
      }),
    ).rejects.toThrow("任务名称最多 20 个字");
    expect(noteApiMock.PATCH).not.toHaveBeenCalled();
  });

  /**
   * 退回：那一行会从「已提交」移到「已退回」，两个 tab 的计数都变，
   * 所以失效范围是整棵 submissions 子树 + 详情，而不是当前页那一条。
   */
  it("useReturnSubmissionMutation：POST 提交记录 id，失效该任务的提交记录与详情", async () => {
    noteApiMock.POST.mockResolvedValue(envelope("SUCCESS"));
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHookWithProviders(() => useReturnSubmissionMutation(9), {
      queryClient,
    });

    await result.current.mutateAsync(31);

    expect(noteApiMock.POST).toHaveBeenCalledWith("/admin/noteTasks/submissions/return/{id}", {
      params: { path: { id: 31 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskQueryKeys.submissionsAll(9) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskQueryKeys.adminDetail(9) });
    // 不该顺手把整个 tasks 域刷一遍
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: taskQueryKeys.all });
  });

  it("useReturnSubmissionMutation：退回失败抛出 ApiError，不失效任何缓存", async () => {
    noteApiMock.POST.mockResolvedValue(failure("B0001", "提交记录不存在"));
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHookWithProviders(() => useReturnSubmissionMutation(9), {
      queryClient,
    });

    await expect(result.current.mutateAsync(31)).rejects.toBeInstanceOf(ApiError);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
