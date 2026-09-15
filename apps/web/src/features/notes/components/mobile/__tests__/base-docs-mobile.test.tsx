import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/notes/3/docs",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: { id: 3, knowledgeBaseName: "我的库", type: 0 },
  })),
}));
vi.mock("@/features/notes/use-docs", () => ({ useKnowledgeBaseDocsQuery: vi.fn() }));

import { MobileBaseDocs } from "@/features/notes/components/mobile/base-docs-mobile";
import { useKnowledgeBaseDocsQuery } from "@/features/notes/use-docs";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false, isFetching: false };

function mockDocs(rows: Array<Record<string, unknown>>) {
  vi.mocked(useKnowledgeBaseDocsQuery).mockReturnValue({ ...IDLE, data: { rows } } as never);
}

describe("MobileBaseDocs（M-05）", () => {
  it("用公共头部，当前 Tab 是「资料」", () => {
    mockDocs([]);
    renderWithProviders(<MobileBaseDocs baseId={3} />);

    expect(screen.getByTestId("mobile-base-header")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-base-tab-docs")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("mobile-base-tabs")).toBeInTheDocument();
  });

  it("资料行可点，进已有的 PDF 详情", () => {
    mockDocs([{ id: 7, docName: "设计规范.pdf", indexStatus: 1, creatorNickname: "陈可" }]);
    renderWithProviders(<MobileBaseDocs baseId={3} />);

    expect(screen.getByTestId("mobile-doc-7")).toHaveAttribute("href", "/m/ai/pdf/7");
    expect(screen.getByText("设计规范.pdf")).toBeInTheDocument();
    expect(screen.getByText("已索引")).toBeInTheDocument();
  });

  it("未索引的行给「未索引」徽标", () => {
    mockDocs([{ id: 7, docName: "草稿.pdf", indexStatus: 0 }]);
    renderWithProviders(<MobileBaseDocs baseId={3} />);
    expect(screen.getByText("未索引")).toBeInTheDocument();
  });

  it("列表末尾有「去「PDF 问答」上传 ›」文字链接", () => {
    mockDocs([{ id: 7, docName: "设计规范.pdf", indexStatus: 1 }]);
    renderWithProviders(<MobileBaseDocs baseId={3} />);

    expect(screen.getByTestId("mobile-doc-upload-link")).toHaveAttribute("href", "/m/ai/pdf");
    expect(screen.getByTestId("mobile-doc-upload-link")).toHaveTextContent("去「PDF 问答」上传");
  });

  it("空态按 12.0.3 的表（还没有资料 / 说明 / 去上传）", () => {
    mockDocs([]);
    renderWithProviders(<MobileBaseDocs baseId={3} />);

    expect(screen.getByText("还没有资料")).toBeInTheDocument();
    expect(screen.getByText("到「PDF 问答」上传 PDF，之后就能围绕它提问。")).toBeInTheDocument();
    // 空态的动作用「去上传」，指向同一条 PDF 问答链路
    expect(screen.getByTestId("mobile-doc-upload-link")).toHaveAttribute("href", "/m/ai/pdf");
  });

  it("加载失败展示错误并可重试（12.7.4 的错误态）", () => {
    const refetch = vi.fn();
    vi.mocked(useKnowledgeBaseDocsQuery).mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error("超时"),
      refetch,
    } as never);
    renderWithProviders(<MobileBaseDocs baseId={3} />);

    expect(screen.getByRole("alert")).toHaveTextContent("资料加载失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalled();
  });
});
