import { renderWithProviders } from "@/test/render";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { GET: vi.fn() },
  fileApi: { GET: vi.fn() },
}));

import { LegacyMoocRedirect } from "@/features/mooc/components/legacy-mooc-redirect";
import { noteApi } from "@/lib/api/openapi";

const noteApiMock = vi.mocked(noteApi, true);

function envelope(data: unknown) {
  return {
    response: new Response(JSON.stringify({ code: "00000", msg: "操作成功", data }), {
      status: 200,
    }),
  };
}

/**
 * 旧地址 `/mooc/:id` 的补救。
 *
 * 关键点是**用 `replace` 而不是 `push`**：旧地址留在历史里会让详情页的返回键
 * 变成"回到旧地址 → 又被弹回详情"的死循环，用户看到的是返回键失灵。
 */
describe("LegacyMoocRedirect", () => {
  beforeEach(() => {
    replace.mockReset();
    noteApiMock.GET.mockReset();
  });

  it("拿到 knowledgeBaseId 后用知识库内地址 replace", async () => {
    noteApiMock.GET.mockResolvedValue(envelope({ id: 12, title: "高数", knowledgeBaseId: 3 }));
    renderWithProviders(<LegacyMoocRedirect moocId={12} />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/notes/3/mooc/12"));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/moocs/{id}",
      expect.objectContaining({ params: { path: { id: 12 } } }),
    );
  });

  it("移动端落点是 /m 下的同一路由", async () => {
    noteApiMock.GET.mockResolvedValue(envelope({ id: 12, title: "高数", knowledgeBaseId: 3 }));
    renderWithProviders(<LegacyMoocRedirect moocId={12} variant="mobile" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/m/notes/3/mooc/12"));
  });

  it("查询失败显示不存在态，不一直转圈也不跳转", async () => {
    noteApiMock.GET.mockResolvedValue({
      response: new Response(JSON.stringify({ code: "B0001", msg: "课程不存在" }), {
        status: 200,
      }),
    });
    renderWithProviders(<LegacyMoocRedirect moocId={12} />);

    expect(await screen.findByText("找不到这个课程")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("后端没返回 knowledgeBaseId 时按找不到处理，不无限等待", async () => {
    // 契约异常不能变成白屏：拿不到库 id 就永远拼不出新地址
    noteApiMock.GET.mockResolvedValue(envelope({ id: 12, title: "高数" }));
    renderWithProviders(<LegacyMoocRedirect moocId={12} />);

    expect(await screen.findByText("找不到这个课程")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
