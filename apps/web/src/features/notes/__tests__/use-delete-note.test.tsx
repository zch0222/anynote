import { noteQueryKeys } from "@/features/notes/query-keys";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { act, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteNoteMutation } from "../use-delete-note";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const remove = noteApi.DELETE as unknown as Mock;

function envelope(data: unknown = null, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

beforeEach(() => {
  remove.mockReset();
});

describe("useDeleteNoteMutation", () => {
  it("删除后清掉详情缓存并失效列表缓存", async () => {
    remove.mockResolvedValue(envelope());
    const { result, queryClient } = renderHookWithProviders(() => useDeleteNoteMutation());
    const detailKey = noteQueryKeys.detail(42);
    queryClient.setQueryData(detailKey, { id: 42, title: "将被删除" });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync(42);
    });

    expect(remove).toHaveBeenCalledExactlyOnceWith("/notes/{noteId}", {
      params: { path: { noteId: 42 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(queryClient.getQueryData(detailKey)).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: noteQueryKeys.lists });
  });

  it("业务失败时进入错误态且不重试", async () => {
    remove.mockResolvedValue(envelope(null, "A0301"));
    const { result } = renderHookWithProviders(() => useDeleteNoteMutation());

    await act(async () => {
      await result.current.mutateAsync(42).catch(() => undefined);
    });

    expect(remove).toHaveBeenCalledTimes(1);
    /*
     * `mutateAsync` 的 rejection 已经消化在 catch 里了，但 mutation 的
     * `isError` 是 React state，要等一次重渲染才可见。直接断言会在某些调度下
     * 读到上一帧的 false —— 这是本条用例此前 8/10 失败的原因（在干净的 dev 上
     * 同样复现）。用 `waitFor` 等它落定，而不是靠 `act` 的时序运气。
     */
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
