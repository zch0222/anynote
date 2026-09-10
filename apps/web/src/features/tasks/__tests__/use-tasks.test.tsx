import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({ noteApi: { GET: vi.fn(), POST: vi.fn() } }));

import { taskQueryKeys } from "@/features/tasks/query-keys";
import { useSubmitTaskMutation, useTasksQuery } from "@/features/tasks/use-tasks";
import { noteApi } from "@/lib/api/openapi";

const noteApiMock = vi.mocked(noteApi, true);

function envelope(data: unknown, code = "00000"): { response: Response } {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), { status: 200 }),
  };
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function wrapperWith(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("use-tasks", () => {
  beforeEach(() => {
    noteApiMock.GET.mockReset();
    noteApiMock.POST.mockReset();
  });

  it("任务列表：平铺 query 且 knowledgeBaseId 必传，无知识库不请求", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope({
        current: 1,
        pages: 1,
        total: 1,
        rows: [{ id: 3, taskName: "周报", submissionStatus: 0 }],
      }),
    );
    const { result } = renderHook(() => useTasksQuery(5), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/noteTasks",
      expect.objectContaining({
        params: { query: { page: 1, pageSize: 50, knowledgeBaseId: 5 } },
      }),
    );
    expect(result.current.data?.rows[0]?.taskName).toBe("周报");

    noteApiMock.GET.mockClear();
    renderHook(() => useTasksQuery(0), { wrapper: wrapper() });
    expect(noteApiMock.GET).not.toHaveBeenCalled();
  });

  it("提交任务：body 走契约 DTO，成功后失效任务列表", async () => {
    noteApiMock.POST.mockResolvedValue(envelope("SUCCESS"));
    const queryClient = new QueryClient();
    queryClient.setQueryData(taskQueryKeys.list(5, 1), { any: true });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSubmitTaskMutation(), {
      wrapper: wrapperWith(queryClient),
    });

    await result.current.mutateAsync({ noteId: 11, noteTaskId: 3 });
    expect(noteApiMock.POST).toHaveBeenCalledWith(
      "/noteTasks/submit",
      expect.objectContaining({ body: { noteId: 11, noteTaskId: 3 } }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: taskQueryKeys.all });
  });

  it("非法提交参数（noteId<=0）在客户端被拒绝", async () => {
    const { result } = renderHook(() => useSubmitTaskMutation(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ noteId: 0, noteTaskId: 3 })).rejects.toThrow();
    expect(noteApiMock.POST).not.toHaveBeenCalled();
  });
});
