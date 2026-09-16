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
const post = noteApi.POST as unknown as Mock;

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
  post.mockReset();
});

describe("useNotesQuery", () => {
  /*
   * 端点选择是这条查询的**正确性核心**，不是实现细节：
   *
   * `GET /notes`（`selectNoteList`）的 FROM 子句是 `n_note_operation_log`，
   * 只有产生过操作日志的笔记才在结果里。而 `createNote` 只投递
   * `GENERATOR_NOTE_INDEX`、**不写操作日志**，所以"新建后没编辑过"的笔记
   * 在 `GET /notes` 下恒不可见——用户看到的就是"建完了知识库里没有"。
   *
   * 知识库内的笔记列表必须走 `POST /notes/bases/{baseId}`（`selectNoteInfoList`，
   * FROM `n_note`），这也是 legacy 前端 `useNoteList` 一直用的端点。
   * 断言锁死端点本身，避免以后有人"顺手统一成 GET /notes"把这个 bug 带回来。
   */
  it("走知识库笔记端点，不用只含操作日志的 GET /notes", async () => {
    post.mockResolvedValue(envelope(pageData));
    const { result } = renderHookWithProviders(() =>
      useNotesQuery({ knowledgeBaseId: 7, page: 2, pageSize: 20 }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(post).toHaveBeenCalledExactlyOnceWith("/notes/bases/{baseId}", {
      params: { path: { baseId: 7 } },
      body: { page: 2, pageSize: 20 },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    // GET /notes 的语义是"我最近操作过的笔记"，不是"这个库里的笔记"
    expect(get).not.toHaveBeenCalled();
  });

  it("返回补全后的分页结构", async () => {
    post.mockResolvedValue(envelope(pageData));
    const { result } = renderHookWithProviders(() =>
      useNotesQuery({ knowledgeBaseId: 7, page: 2, pageSize: 20 }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      rows: pageData.rows,
      total: 55,
      pages: 3,
      current: 2,
    });
  });

  it("后端缺省 total/pages/current 时按 rows 与请求页兜底", async () => {
    post.mockResolvedValue(envelope({ rows: [{ id: 9, title: "唯一一篇" }] }));
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
    expect(post).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("业务失败码抛出 ApiError", async () => {
    post.mockResolvedValue(envelope(null, "A0301"));
    const { result } = renderHookWithProviders(() =>
      useNotesQuery({ knowledgeBaseId: 7, page: 1, pageSize: 20 }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ApiError);
    expect(result.current.error).toMatchObject({ code: "A0301" });
  });
});
