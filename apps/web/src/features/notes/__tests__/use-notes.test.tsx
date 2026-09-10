import { ApiError } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { act, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotesQuery } from "../use-notes";

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

const pageData = {
  current: 2,
  pages: 3,
  total: 55,
  rows: [
    { id: 1, title: "第一篇", updateTime: "2026-09-10T10:00:00.000Z" },
    { id: 2, title: null },
  ],
};

beforeEach(() => {
  get.mockReset();
});

describe("useNotesQuery", () => {
  it("请求带分页与知识库参数，返回补全后的分页结构", async () => {
    get.mockResolvedValue(envelope(pageData));
    const { result } = renderHookWithProviders(() =>
      useNotesQuery({ knowledgeBaseId: 7, page: 2, pageSize: 20 }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledExactlyOnceWith("/notes", {
      params: { query: { page: 2, pageSize: 20, knowledgeBaseId: 7 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toEqual({
      rows: pageData.rows,
      total: 55,
      pages: 3,
      current: 2,
    });
  });

  it("后端缺省 total/pages/current 时按 rows 与请求页兜底", async () => {
    get.mockResolvedValue(envelope({ rows: [{ id: 9, title: "唯一一篇" }] }));
    const { result } = renderHookWithProviders(() =>
      useNotesQuery({ knowledgeBaseId: 7, page: 1, pageSize: 20 }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ total: 1, pages: 1, current: 1 });
  });

  it("knowledgeBaseId 非法时不发请求", async () => {
    const { result } = renderHookWithProviders(() =>
      useNotesQuery({ knowledgeBaseId: Number.NaN, page: 1, pageSize: 20 }),
    );
    await act(async () => {});
    expect(get).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("业务失败码抛出 ApiError", async () => {
    get.mockResolvedValue(envelope(null, "A0301"));
    const { result } = renderHookWithProviders(() =>
      useNotesQuery({ knowledgeBaseId: 7, page: 1, pageSize: 20 }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ code: "A0301" });
  });
});
