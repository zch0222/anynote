import { taskQueryKeys } from "@/features/tasks/query-keys";
import {
  isHeatmapUnavailable,
  isTaskMissing,
  useAdminTaskQuery,
  useMemberTaskQuery,
  useTaskHeatmapQuery,
  useTaskSubmissionsQuery,
  useTaskTimelineQuery,
} from "@/features/tasks/use-task-detail";
import { ApiError } from "@/lib/api/errors";
import { renderHookWithProviders } from "@/test/render";
import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 网络层打桩到 openapi-fetch 客户端（仓库约定：不 mock 全局 fetch）
vi.mock("@/lib/api/openapi", () => ({ noteApi: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }));

import { noteApi } from "@/lib/api/openapi";

const noteApiMock = vi.mocked(noteApi, true);

function envelope(data: unknown, code = "00000", status = 200): { response: Response } {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), { status }),
  };
}

function failure(code: string, msg: string, status = 200): { response: Response } {
  return { response: new Response(JSON.stringify({ code, msg }), { status }) };
}

function page(rows: unknown[], extra: Record<string, unknown> = {}) {
  return { current: 1, pages: 1, total: rows.length, rows, ...extra };
}

describe("use-task-detail", () => {
  beforeEach(() => {
    noteApiMock.GET.mockReset();
  });

  it("useAdminTaskQuery：成功解析管理员任务详情", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope({
        id: 9,
        taskName: "读书笔记",
        taskDescribe: "写一篇",
        startTime: "2026-09-10T10:00:00",
        endTime: "2026-09-18T23:59:00",
        knowledgeBaseId: 5,
        needSubmitCount: 12,
        submittedCount: 8,
        submissionProgress: 0.67,
      }),
    );
    const { result } = renderHookWithProviders(() => useAdminTaskQuery(9));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith("/admin/noteTasks/{id}", {
      params: { path: { id: 9 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toMatchObject({
      taskName: "读书笔记",
      knowledgeBaseId: 5,
      needSubmitCount: 12,
      submittedCount: 8,
    });
  });

  it("useAdminTaskQuery：业务错误（无权限）原样抛出 ApiError，由页面转不存在态", async () => {
    noteApiMock.GET.mockResolvedValue(failure("A0301", "没有权限查看笔记任务信息"));
    const { result } = renderHookWithProviders(() => useAdminTaskQuery(9));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(isTaskMissing(result.current.error)).toBe(true);
  });

  it("useTaskSubmissionsQuery：tab 映射到 userTaskStatus，每页 20", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope(
        page([
          {
            id: 31,
            noteId: 77,
            noteTitle: "读书笔记",
            submissionNickname: "林一",
            noteEditCount: 41,
            submitTime: "2026-09-13T10:00:00",
          },
        ]),
      ),
    );
    const { result } = renderHookWithProviders(() => useTaskSubmissionsQuery(9, "returned", 2));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/admin/noteTasks/submissions",
      expect.objectContaining({
        params: { query: { noteTaskId: 9, page: 2, pageSize: 20, userTaskStatus: 3 } },
      }),
    );
    expect(result.current.data?.rows[0]?.noteTitle).toBe("读书笔记");
    expect(result.current.data?.total).toBe(1);
  });

  it("useTaskSubmissionsQuery：「未提交」tab 传 0，且行上没有 noteId", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope(page([{ id: 41, submissionNickname: "周宁", submissionUsername: "zhou" }])),
    );
    const { result } = renderHookWithProviders(() => useTaskSubmissionsQuery(9, "pending", 1));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/admin/noteTasks/submissions",
      expect.objectContaining({
        params: { query: { noteTaskId: 9, page: 1, pageSize: 20, userTaskStatus: 0 } },
      }),
    );
    expect(result.current.data?.rows[0]?.noteId).toBeUndefined();
  });

  /** §1.4 第 8 条：成员侧没有单条端点，只能逐页找。 */
  it("useMemberTaskQuery：第一页就命中时不再翻页", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope(
        page(
          [
            { id: 2, taskName: "别的任务" },
            { id: 9, taskName: "周报", submissionStatus: 0 },
          ],
          {
            pages: 3,
          },
        ),
      ),
    );
    const { result } = renderHookWithProviders(() => useMemberTaskQuery(5, 9));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledTimes(1);
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/noteTasks",
      expect.objectContaining({
        params: { query: { page: 1, pageSize: 50, knowledgeBaseId: 5 } },
      }),
    );
    expect(result.current.data?.taskName).toBe("周报");
  });

  it("useMemberTaskQuery：命中在第二页时继续翻页并停止", async () => {
    noteApiMock.GET.mockResolvedValueOnce(
      envelope(page([{ id: 1 }], { pages: 3 })),
    ).mockResolvedValueOnce(envelope(page([{ id: 9, taskName: "周报" }], { pages: 3 })));
    const { result } = renderHookWithProviders(() => useMemberTaskQuery(5, 9));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledTimes(2);
    expect(noteApiMock.GET).toHaveBeenLastCalledWith(
      "/noteTasks",
      expect.objectContaining({
        params: { query: { page: 2, pageSize: 50, knowledgeBaseId: 5 } },
      }),
    );
    expect(result.current.data?.id).toBe(9);
  });

  it("useMemberTaskQuery：翻完所有页都没有时返回 null（页面据此显示不存在态）", async () => {
    noteApiMock.GET.mockResolvedValueOnce(
      envelope(page([{ id: 1 }], { pages: 2 })),
    ).mockResolvedValueOnce(envelope(page([{ id: 2 }], { pages: 2 })));
    const { result } = renderHookWithProviders(() => useMemberTaskQuery(5, 9));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(noteApiMock.GET).toHaveBeenCalledTimes(2);
  });

  it("useTaskHeatmapQuery：打 B-1 新端点并解析矩阵", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope({
        startDate: "2026-09-01",
        endDate: "2026-09-03",
        today: "2026-09-02",
        days: ["2026-09-01", "2026-09-02", "2026-09-03"],
        members: [{ userId: 7, nickname: "林一", noteId: 77, total: 41, counts: [20, 21, 0] }],
      }),
    );
    const { result } = renderHookWithProviders(() => useTaskHeatmapQuery(9));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/admin/noteTasks/{id}/editHeatmap",
      expect.objectContaining({ params: { path: { id: 9 } } }),
    );
    expect(result.current.data?.days).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(result.current.data?.members?.[0]?.counts).toEqual([20, 21, 0]);
  });

  /** B-1 未上线时是 404：整卡隐藏，不能弹错误、也不能一直重试。 */
  it("useTaskHeatmapQuery：404 时 isHeatmapUnavailable 为 true 且不重试", async () => {
    noteApiMock.GET.mockResolvedValue(failure("B0500", "服务响应格式异常", 404));
    const { result } = renderHookWithProviders(() => useTaskHeatmapQuery(9));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledTimes(1);
    expect(isHeatmapUnavailable(result.current.error)).toBe(true);
  });

  it("useTaskHeatmapQuery：其它错误不算「未上线」（页面要显示 QueryError）", async () => {
    noteApiMock.GET.mockResolvedValue(failure("B0001", "任务不存在"));
    const { result } = renderHookWithProviders(() => useTaskHeatmapQuery(9));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isHeatmapUnavailable(result.current.error)).toBe(false);
  });

  it("useTaskTimelineQuery：只保留提交 3 与退回 4，新的在上", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope([
        { id: 1, type: 1, operationTime: "2026-09-01T09:00:00" },
        { id: 2, type: 3, operationTime: "2026-09-10T09:00:00", noteHistoryTitle: "读书笔记" },
        { id: 3, type: 4, operationTime: "2026-09-12T09:00:00" },
        { id: 4, type: 2, operationTime: "2026-09-11T09:00:00" },
      ]),
    );
    const { result } = renderHookWithProviders(() => useTaskTimelineQuery(9));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((item) => item.id)).toEqual([3, 2]);
    expect(result.current.data?.map((item) => item.type)).toEqual([4, 3]);
  });

  it("useTaskTimelineQuery：data 为空时不抛（后端可能返回 null）", async () => {
    noteApiMock.GET.mockResolvedValue(envelope(null));
    const { result } = renderHookWithProviders(() => useTaskTimelineQuery(9));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("非法 id 不发请求", () => {
    renderHookWithProviders(() => useAdminTaskQuery(0));
    renderHookWithProviders(() => useTaskHeatmapQuery(Number.NaN));
    renderHookWithProviders(() => useTaskTimelineQuery(-1));
    expect(noteApiMock.GET).not.toHaveBeenCalled();
  });

  it("query key 挂在 tasks 域下", () => {
    expect(taskQueryKeys.adminDetail(9)).toEqual(["tasks", "admin", "detail", 9]);
  });
});
