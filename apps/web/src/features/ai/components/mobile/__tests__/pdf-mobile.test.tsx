import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/ai/pdf",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: [{ id: 3, knowledgeBaseName: "我的库" }],
  })),
}));

const upload = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => 7), isPending: false }));
const deleteDoc = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => undefined),
  isPending: false,
}));
vi.mock("@/features/ai/use-docs", () => ({
  useDocsQuery: vi.fn(),
  useDocQuery: vi.fn(),
  useDocIndexStatus: vi.fn(() => ({ data: undefined })),
  useUploadPdfMutation: () => upload,
  useDeleteDocMutation: () => deleteDoc,
}));

vi.mock("@/features/ai/components/chat-panel", () => ({
  ChatPanel: ({ sessionKey, docId }: { sessionKey: string; docId?: number }) => (
    <div data-testid="chat-panel" data-session-key={sessionKey} data-doc-id={docId} />
  ),
}));
vi.mock("@/features/ai/components/pdf/pdf-viewer", () => ({
  PdfViewer: ({ url }: { url: string }) => <div data-testid="pdf-viewer" data-url={url} />,
}));

import { MobilePdfDetail } from "@/features/ai/components/mobile/pdf-detail-mobile";
import { MobilePdfList } from "@/features/ai/components/mobile/pdf-list-mobile";
import { useDocQuery, useDocsQuery } from "@/features/ai/use-docs";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false, isSuccess: true };

describe("MobilePdfList", () => {
  it("渲染文档并跳到详情页，带索引状态徽章", () => {
    vi.mocked(useDocsQuery).mockReturnValue({
      ...IDLE,
      data: { rows: [{ id: 7, docName: "论文.pdf", indexStatus: 1 }] },
    } as never);
    renderWithProviders(<MobilePdfList />);

    expect(screen.getByRole("link", { name: /论文\.pdf/ })).toHaveAttribute("href", "/m/ai/pdf/7");
    expect(screen.getByText("已索引")).toBeInTheDocument();
  });

  it("空文档库给上传引导", () => {
    vi.mocked(useDocsQuery).mockReturnValue({ ...IDLE, data: { rows: [] } } as never);
    renderWithProviders(<MobilePdfList />);
    expect(screen.getByText("还没有文档")).toBeInTheDocument();
  });

  it("加载失败展示错误", () => {
    vi.mocked(useDocsQuery).mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("网络异常"),
    } as never);
    renderWithProviders(<MobilePdfList />);
    expect(screen.getByText(/文档加载失败：网络异常/)).toBeInTheDocument();
  });

  it("只接受 PDF：选到别的类型直接拒绝，不打后端", async () => {
    vi.mocked(useDocsQuery).mockReturnValue({ ...IDLE, data: { rows: [] } } as never);
    const { container } = renderWithProviders(<MobilePdfList />);
    upload.mutateAsync.mockClear();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    // 系统文件选择器在移动端会出「文件 / 相册」，类型校验必须在前端先做
    expect(input.accept).toBe("application/pdf");
    fireEvent.change(input, {
      target: { files: [new File(["x"], "note.txt", { type: "text/plain" })] },
    });

    await waitFor(() => {
      expect(upload.mutateAsync).not.toHaveBeenCalled();
    });
  });

  it("选到 PDF 时带知识库 id 上传", async () => {
    vi.mocked(useDocsQuery).mockReturnValue({ ...IDLE, data: { rows: [] } } as never);
    const { container } = renderWithProviders(<MobilePdfList />);
    upload.mutateAsync.mockClear();

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "论文.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(upload.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ knowledgeBaseId: 3 }),
      );
    });
  });

  it("删除走底部动作表并二次确认", async () => {
    vi.mocked(useDocsQuery).mockReturnValue({
      ...IDLE,
      data: { rows: [{ id: 7, docName: "论文.pdf", indexStatus: 0 }] },
    } as never);
    renderWithProviders(<MobilePdfList />);

    fireEvent.click(screen.getByRole("button", { name: "「论文.pdf」的操作" }));
    fireEvent.click(screen.getByRole("button", { name: "删除文档" }));
    expect(deleteDoc.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "再点一次确认删除" }));
    await waitFor(() => {
      expect(deleteDoc.mutateAsync).toHaveBeenCalledWith({ docId: 7, knowledgeBaseId: 3 });
    });
  });
});

describe("MobilePdfDetail", () => {
  it("三栏换成预览 / 问答两个标签页，默认停在预览", () => {
    vi.mocked(useDocQuery).mockReturnValue({
      ...IDLE,
      data: { id: 7, docName: "论文.pdf", url: "https://obs/x.pdf", indexStatus: 1 },
    } as never);
    renderWithProviders(<MobilePdfDetail docId={7} />);

    expect(screen.getByRole("tab", { name: "预览" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("pdf-viewer")).toHaveAttribute("data-url", "https://obs/x.pdf");
  });

  it("问答页用与桌面相同的文档会话 key", () => {
    vi.mocked(useDocQuery).mockReturnValue({
      ...IDLE,
      data: { id: 7, docName: "论文.pdf", url: "https://obs/x.pdf", indexStatus: 1 },
    } as never);
    renderWithProviders(<MobilePdfDetail docId={7} />);

    fireEvent.click(screen.getByRole("tab", { name: "问答" }));
    const panel = screen.getByTestId("chat-panel");
    expect(panel).toHaveAttribute("data-doc-id", "7");
    expect(panel).toHaveAttribute("data-session-key", "doc7");
  });

  it("索引未就绪时顶栏显示索引中", () => {
    vi.mocked(useDocQuery).mockReturnValue({
      ...IDLE,
      data: { id: 7, docName: "论文.pdf", url: "", indexStatus: 0 },
    } as never);
    renderWithProviders(<MobilePdfDetail docId={7} />);
    expect(screen.getByText("索引中")).toBeInTheDocument();
  });

  it("没有预览地址时给提示而不是空白", () => {
    vi.mocked(useDocQuery).mockReturnValue({
      ...IDLE,
      data: { id: 7, docName: "论文.pdf", url: null, indexStatus: 1 },
    } as never);
    renderWithProviders(<MobilePdfDetail docId={7} />);
    expect(screen.getByText("这篇文档还没有可预览的地址。")).toBeInTheDocument();
  });

  it("详情加载失败展示错误（M7.6 缺口下的降级路径）", () => {
    vi.mocked(useDocQuery).mockReturnValue({
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error("转存失败"),
    } as never);
    renderWithProviders(<MobilePdfDetail docId={7} />);
    expect(screen.getByText(/文档加载失败：转存失败/)).toBeInTheDocument();
  });
});
