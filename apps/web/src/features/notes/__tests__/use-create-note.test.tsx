import { noteQueryKeys } from "@/features/notes/query-keys";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { act } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateNoteMutation } from "../use-create-note";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const post = noteApi.POST as unknown as Mock;

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

beforeEach(() => {
  post.mockReset();
});

describe("useCreateNoteMutation", () => {
  it("提交标题与知识库，返回新笔记 id 并失效列表缓存", async () => {
    post.mockResolvedValue(envelope(88));
    const { result, queryClient } = renderHookWithProviders(() => useCreateNoteMutation());
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const noteId = await act(async () =>
      result.current.mutateAsync({ knowledgeBaseId: 7, title: "新笔记" }),
    );

    expect(noteId).toBe(88);
    expect(post).toHaveBeenCalledExactlyOnceWith("/notes", {
      body: { knowledgeBaseId: 7, title: "新笔记" },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: noteQueryKeys.lists });
  });

  it("业务失败码进入错误态且不重试", async () => {
    post.mockResolvedValue(envelope(null, "A0402"));
    const { result } = renderHookWithProviders(() => useCreateNoteMutation());

    await act(async () => {
      await result.current
        .mutateAsync({ knowledgeBaseId: 7, title: "标题" })
        .catch(() => undefined);
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(true);
  });
});
