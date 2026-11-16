import { renderHookWithProviders } from "@/test/render";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({ noteApi: { GET: vi.fn() } }));
import { noteApi } from "@/lib/api/openapi";
import { useChatKnowledgeBasesQuery } from "../use-chat-scope";

/**
 * 聊天范围列表分页测试。
 *
 * @author 称霸幼儿园
 */
describe("useChatKnowledgeBasesQuery", () => {
  /** 取完后端声明的全部页，避免范围选项遗漏。 */
  it("合并分页中的知识库", async () => {
    vi.mocked(noteApi.GET).mockImplementation(async (_path, options) => {
      const page = (options as { params: { query: { page: number } } }).params.query.page;
      return {
        response: new Response(
          JSON.stringify({
            code: "00000",
            data: { pages: 2, rows: [{ id: page, knowledgeBaseName: `库${page}` }] },
          }),
        ),
      } as never;
    });
    const { result } = renderHookWithProviders(() => useChatKnowledgeBasesQuery());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((base) => base.id)).toEqual([1, 2]);
    expect(noteApi.GET).toHaveBeenCalledTimes(2);
  });
});
