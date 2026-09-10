import { ApiError } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteQuery } from "../use-note";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const get = noteApi.GET as unknown as Mock;

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

beforeEach(() => {
  get.mockReset();
});

describe("useNoteQuery", () => {
  it("请求笔记详情并解析正文", async () => {
    get.mockResolvedValue(
      envelope({ id: 42, title: "标题", content: "# 正文", knowledgeBaseId: 7 }),
    );
    const { result } = renderHookWithProviders(() => useNoteQuery(42));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledExactlyOnceWith("/notes/{noteId}", {
      params: { path: { noteId: 42 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toMatchObject({ id: 42, content: "# 正文" });
  });

  it("非法 id 不发请求", async () => {
    renderHookWithProviders(() => useNoteQuery(Number.NaN));
    await waitFor(() => expect(get).not.toHaveBeenCalled());
  });

  it("详情 schema 校验失败（缺 id）按数据异常处理", async () => {
    get.mockResolvedValue(envelope({ title: "没有 id 的笔记" }));
    const { result } = renderHookWithProviders(() => useNoteQuery(42));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ code: "B0500" });
  });
});
