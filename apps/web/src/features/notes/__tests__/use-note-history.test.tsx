import { RES_CODE } from "@anynote/api-core/codes";
import { QueryClient } from "@tanstack/react-query";
import { noteQueryKeys } from "@/features/notes/query-keys";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { act, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HISTORY_PAGE_SIZE,
  HISTORY_REFETCH_DELAY_MS,
  useNoteHistoryInfinite,
  useNoteHistoryQuery,
  useRestoreNoteVersionMutation,
} from "../use-note-history";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const get = noteApi.GET as unknown as Mock;
const patch = noteApi.PATCH as unknown as Mock;

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

function historyRow(id: number, time: string) {
  return { operationLogId: id, operationTime: time, updaterNickname: "陈可" };
}

/** 历史列表端点返回的一页。 */
function historyPage(page: number, total: number, count = HISTORY_PAGE_SIZE) {
  return {
    current: page,
    pages: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
    total,
    rows: Array.from({ length: count }, (_, index) =>
      historyRow(page * 100 + index, `2026-09-1${page}T03:00:00.000Z`),
    ),
  };
}

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNoteHistoryInfinite", () => {
  it("每页 15 条，按 pages 判断还有没有下一页", async () => {
    get.mockImplementation((path: string, init: { params: { query: { page: number } } }) => {
      if (path !== "/notes/historyList") return Promise.resolve(envelope(null));
      return Promise.resolve(envelope(historyPage(init.params.query.page, 40)));
    });

    const { result } = renderHookWithProviders(() => useNoteHistoryInfinite(42));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(get).toHaveBeenCalledExactlyOnceWith("/notes/historyList", {
      params: { query: { noteId: 42, page: 1, pageSize: HISTORY_PAGE_SIZE } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data?.pages[0]?.rows).toHaveLength(HISTORY_PAGE_SIZE);
    // 40 条 / 每页 15 ⇒ 3 页
    expect(result.current.data?.pages[0]?.total).toBe(40);
    expect(result.current.hasNextPage).toBe(true);
  });

  it("翻到最后一页后 hasNextPage 变 false：40 条到第 3 页为止", async () => {
    get.mockImplementation((_path: string, init: { params: { query: { page: number } } }) =>
      Promise.resolve(envelope(historyPage(init.params.query.page, 40, 10))),
    );

    const { result } = renderHookWithProviders(() => useNoteHistoryInfinite(42));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 每次 fetchNextPage 都等 hasNextPage 与页数都稳定下来再发下一次：
    // 连发两次时 TanStack 的乐观页码是本地推算的，不保证两页都会落地
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(3));
    expect(result.current.hasNextPage).toBe(false);
    const pages = get.mock.calls.map((call) => call[1].params.query.page);
    expect(pages).toEqual([1, 2, 3]);
  });

  it("非法 noteId 不发请求", async () => {
    renderHookWithProviders(() => useNoteHistoryInfinite(Number.NaN));

    await waitFor(() => expect(get).not.toHaveBeenCalled());
  });
});

describe("useNoteHistoryQuery", () => {
  it("按 operationId 取版本内容", async () => {
    get.mockResolvedValue(
      envelope({ noteHistoryId: 5, title: "旧标题", content: "# 旧正文", historyTime: "2026-09-12T03:00:00.000Z" }),
    );

    const { result } = renderHookWithProviders(() => useNoteHistoryQuery(901));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledExactlyOnceWith("/notes/history", {
      params: { query: { operationId: 901 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toMatchObject({ title: "旧标题", content: "# 旧正文" });
  });

  it("operationId 为 null 时不发请求（列表还没选中任何版本）", async () => {
    renderHookWithProviders(() => useNoteHistoryQuery(null));

    await waitFor(() => expect(get).not.toHaveBeenCalled());
  });
});

describe("useRestoreNoteVersionMutation", () => {
  it("先 GET 取最新版本号，再带该版本号 PATCH 写回历史版本的标题与正文", async () => {
    get.mockResolvedValue(envelope({ id: 42, updateTime: "2026-09-16T03:00:00.000Z" }));
    patch.mockResolvedValue(
      envelope({
        id: 42,
        title: "旧标题",
        content: "# 旧正文",
        updateTime: "2026-09-16T04:00:00.000Z",
        version: "1789000000000",
      }),
    );

    const { result } = renderHookWithProviders(() => useRestoreNoteVersionMutation());

    await act(async () => {
      await result.current.mutateAsync({ noteId: 42, title: "旧标题", content: "# 旧正文" });
    });

    // 顺序：先读详情拿版本号，再写回
    expect(get).toHaveBeenCalledExactlyOnceWith("/notes/{noteId}", {
      params: { path: { noteId: 42 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(patch).toHaveBeenCalledExactlyOnceWith("/notes/{noteId}", {
      params: { path: { noteId: 42 } },
      // version 取 GET 的 updateTime 派生的毫秒时间戳，不是调用方传的
      body: { title: "旧标题", content: "# 旧正文", version: String(Date.parse("2026-09-16T03:00:00.000Z")) },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
  });

  it("成功后把返回值写回详情缓存，回到编辑器读到的就是恢复后的正文", async () => {
    get.mockResolvedValue(envelope({ id: 42, updateTime: "2026-09-16T03:00:00.000Z" }));
    patch.mockResolvedValue(
      envelope({
        id: 42,
        title: "恢复后标题",
        content: "# 恢复后正文",
        updateTime: "2026-09-16T04:00:00.000Z",
      }),
    );

    // 这条用例要断言**没有被任何观察者订阅**的详情缓存，默认测试客户端的
    // gcTime: 0 会在写入后立刻回收它。换成 gcTime 正常的实例。
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHookWithProviders(() => useRestoreNoteVersionMutation(), {
      queryClient,
    });
    // 预先塞入编辑器留下的旧缓存，验证它被覆盖而不是被无视
    queryClient.setQueryData(noteQueryKeys.detail(42), {
      id: 42,
      title: "编辑中的标题",
      content: "# 编辑中的正文",
      updateTime: "2026-09-16T03:00:00.000Z",
    });

    await act(async () => {
      await result.current.mutateAsync({ noteId: 42, title: "恢复后标题", content: "# 恢复后正文" });
    });

    expect(queryClient.getQueryData(noteQueryKeys.detail(42))).toMatchObject({
      title: "恢复后标题",
      content: "# 恢复后正文",
      updateTime: "2026-09-16T04:00:00.000Z",
    });
  });

  it("冲突码返回 conflict 而不是抛错，并且立刻重取列表", async () => {
    get.mockResolvedValue(envelope({ id: 42, updateTime: "2026-09-16T03:00:00.000Z" }));
    // 后端在版本过期时返回业务码 A0409（HTTP 200）
    patch.mockResolvedValue(envelope(null, RES_CODE.VERSION_CONFLICT));

    const { result, queryClient } = renderHookWithProviders(() => useRestoreNoteVersionMutation());
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    let outcome: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync({
        noteId: 42,
        title: "旧标题",
        content: "# 旧正文",
      });
    });

    expect(outcome).toEqual({ status: "conflict" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: noteQueryKeys.historyList(42) });
    // 冲突是业务事实，不重试
    expect(patch).toHaveBeenCalledTimes(1);
  });

  it("历史列表在 2 秒后才失效（快照由消息队列异步落库）", async () => {
    vi.useFakeTimers();
    get.mockResolvedValue(envelope({ id: 42, updateTime: "2026-09-16T03:00:00.000Z" }));
    patch.mockResolvedValue(envelope({ id: 42, title: "旧标题", content: "# 旧正文" }));

    const { result, queryClient } = renderHookWithProviders(() => useRestoreNoteVersionMutation());
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ noteId: 42, title: "旧标题", content: "# 旧正文" });
    });

    // 立刻失效会重取到不含新版本的列表，所以这一刻不该动
    expect(invalidateSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(HISTORY_REFETCH_DELAY_MS - 1);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: noteQueryKeys.historyList(42) });
    // 只失效列表：历史版本内容是不可变快照，连带清掉会让面板正文闪回骨架
    const keys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(keys).not.toContainEqual(noteQueryKeys.historyDetail(901));
  });

  it("网络失败时抛出，不吞成冲突", async () => {
    get.mockResolvedValue(envelope({ id: 42, updateTime: "2026-09-16T03:00:00.000Z" }));
    patch.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHookWithProviders(() => useRestoreNoteVersionMutation());

    await act(async () => {
      await expect(
        result.current.mutateAsync({ noteId: 42, title: "旧标题", content: "# 旧正文" }),
      ).rejects.toBeInstanceOf(TypeError);
    });

    // 错误态要等一次渲染才落到 observer 上，这里等它稳定
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
