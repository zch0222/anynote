import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 地址参数（D-08 直达入口）。每个用例可改这一份，`PdfChatPage` 读的就是它——
 * 用可变闭包而不是 `vi.mocked(...)`，因为 Next 的 `useSearchParams` 不在模块
 * 依赖里（它是 next/navigation 的导出，测试里只能整体替换）。
 */
let searchParams = new URLSearchParams("");

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/features/ai/use-docs", () => ({
  useDocsQuery: vi.fn(),
  useDocQuery: vi.fn(() => ({ data: undefined, isSuccess: false })),
  useDocIndexStatus: vi.fn(() => ({ data: undefined })),
  useUploadPdfMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useDeleteDocMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(() => ({
    data: [{ id: 1, knowledgeBaseName: "我的库" }],
    isPending: false,
  })),
}));

// ChatPanel 会拉模型列表并接 SSE，这里只关心版式
vi.mock("@/features/ai/components/chat-panel", () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

vi.mock("@/features/ai/components/pdf/pdf-viewer", () => ({
  PdfViewer: () => <div data-testid="pdf-viewer" />,
}));

import { PdfChatPage } from "@/features/ai/components/pdf/pdf-page";
import { useDocsQuery } from "@/features/ai/use-docs";
import { renderWithProviders } from "@/test/render";

function mockDocs(rows: Array<Record<string, unknown>>) {
  vi.mocked(useDocsQuery).mockReturnValue({
    isPending: false,
    isError: false,
    data: { rows },
  } as never);
}

beforeEach(() => {
  searchParams = new URLSearchParams("");
});

/**
 * 窄屏版式回归（M10.0 / UI_INVENTORY P0-1）。
 *
 * 原实现把「文档库 288px」与「问答 w-full + shrink-0」并排放在同一行 flex 里，
 * 375px 视口下两者宽度之和必然溢出 body。jsdom 没有真实布局，量不到 scrollWidth，
 * 所以这里断言产生溢出的**结构条件**：小屏下两个面板不同时占位，且有切换控件；
 * 真正的像素级断言在 e2e/mobile-core.spec.ts 里对 375px 视口做。
 */
describe("PdfChatPage 窄屏版式", () => {
  it("小屏默认只显示文档库，问答面板被折叠", () => {
    mockDocs([{ id: 7, docName: "论文.pdf", indexStatus: 0 }]);
    renderWithProviders(<PdfChatPage />);

    expect(screen.getByTestId("pdf-pane-docs").className).not.toContain("hidden");
    // lg 以下折叠：hidden + lg:flex，桌面三栏形态不受影响
    expect(screen.getByTestId("pdf-pane-chat").className).toContain("hidden");
    expect(screen.getByTestId("pdf-pane-chat").className).toContain("lg:flex");
  });

  it("容器在小屏改为纵向排列，避免两列并排撑破视口", () => {
    mockDocs([]);
    renderWithProviders(<PdfChatPage />);

    const page = screen.getByTestId("pdf-chat-page");
    expect(page.className).toContain("flex-col");
    expect(page.className).toContain("lg:flex-row");
    // 文档库在小屏不能再固定 288px 宽
    expect(screen.getByTestId("pdf-pane-docs").className).toContain("lg:w-72");
  });

  it("切到「问答」后只显示问答面板", () => {
    mockDocs([]);
    renderWithProviders(<PdfChatPage />);

    fireEvent.click(screen.getByRole("tab", { name: "问答" }));

    expect(screen.getByTestId("pdf-pane-docs").className).toContain("hidden");
    expect(screen.getByTestId("pdf-pane-chat").className).not.toContain("hidden");
  });

  it("小屏切换控件只在 lg 以下出现", () => {
    mockDocs([]);
    renderWithProviders(<PdfChatPage />);

    expect(screen.getByTestId("pdf-pane-switch").className).toContain("lg:hidden");
  });

  it("删除按钮在触摸端常显，只有 md 以上才靠 hover 揭示", () => {
    mockDocs([{ id: 7, docName: "论文.pdf", indexStatus: 0 }]);
    renderWithProviders(<PdfChatPage />);

    const remove = screen.getByLabelText("删除「论文.pdf」");
    expect(remove.className).toContain("md:opacity-0");
    expect(remove.className).not.toMatch(/(^|\s)opacity-0/);
  });
});

/**
 * `?baseId=&docId=`（12.2.5 / D-08）：资料 Tab 的行点击与「上传 PDF」直达这里。
 *
 * 只断言"参数被用作了初始值"——选中后的版式是上面那组用例的职责，
 * 混在一起会让参数解析的回归被版式断言掩盖。
 */
describe("PdfChatPage 地址参数", () => {
  it("合法 baseId / docId 立即可用，不必等用户再选一次", () => {
    searchParams = new URLSearchParams({ baseId: "3", docId: "9" });
    mockDocs([]);
    renderWithProviders(<PdfChatPage />);

    // 知识库选择器直接显示参数指定的库（而不是默认第一个「我的库」）
    expect(vi.mocked(useDocsQuery)).toHaveBeenCalledWith(3);
    // docId 生效后右侧进入"已选文档"分支，问答面板不再提示"上传并选中"
    expect(screen.queryByText("上传并选中 PDF 后，可以就文档内容提问。")).toBeNull();
  });

  it("非法参数当作没传，退回默认选第一个库", () => {
    searchParams = new URLSearchParams({ baseId: "abc", docId: "-1" });
    mockDocs([]);
    renderWithProviders(<PdfChatPage />);

    expect(vi.mocked(useDocsQuery)).toHaveBeenCalledWith(1);
    expect(screen.getByText("上传并选中 PDF 后，可以就文档内容提问。")).toBeInTheDocument();
  });

  it("只给小数值的 baseId 也接受（docId 留空）", () => {
    searchParams = new URLSearchParams({ baseId: "12" });
    mockDocs([]);
    renderWithProviders(<PdfChatPage />);

    expect(vi.mocked(useDocsQuery)).toHaveBeenCalledWith(12);
  });
});
