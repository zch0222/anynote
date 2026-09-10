import { noteQueryKeys } from "@/features/notes/query-keys";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { act } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMoveNoteMutation } from "../use-move-note";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const patch = noteApi.PATCH as unknown as Mock;

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

beforeEach(() => {
  patch.mockReset();
});

describe("useMoveNoteMutation", () => {
  it("只携带目标知识库 id，不带 version；成功后清详情缓存并失效列表", async () => {
    patch.mockResolvedValue(
      envelope({ id: 42, updateTime: "2026-09-11T02:00:00.000Z", version: "2000" }),
    );
    const { result, queryClient } = renderHookWithProviders(() => useMoveNoteMutation());
    const detailKey = noteQueryKeys.detail(42);
    queryClient.setQueryData(detailKey, { id: 42, knowledgeBaseId: 7 });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const saved = await act(async () =>
      result.current.mutateAsync({ noteId: 42, knowledgeBaseId: 9 }),
    );

    expect(saved).toMatchObject({ id: 42, version: "2000" });
    const options = patch.mock.calls[0]?.[1];
    expect(patch).toHaveBeenCalledExactlyOnceWith("/notes/{noteId}", expect.anything());
    expect(options.body).toEqual({ knowledgeBaseId: 9 });
    expect(options.params).toEqual({ path: { noteId: 42 } });
    expect(queryClient.getQueryData(detailKey)).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: noteQueryKeys.lists });
  });

  it("目标知识库无权限（A0301）进入错误态且不重试", async () => {
    patch.mockResolvedValue(envelope(null, "A0301"));
    const { result } = renderHookWithProviders(() => useMoveNoteMutation());

    await act(async () => {
      await result.current.mutateAsync({ noteId: 42, knowledgeBaseId: 9 }).catch(() => undefined);
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(true);
  });
});
