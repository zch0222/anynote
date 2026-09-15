import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useKnowledgeBaseQuery = vi.fn();
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: (...args: unknown[]) => useKnowledgeBaseQuery(...args),
}));

// CreateNoteDialog 内部要跳转（创建成功后去编辑页）
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/notes/5/overview",
}));

const useKnowledgeBaseDocsQuery = vi.fn();
vi.mock("@/features/notes/use-docs", () => ({
  useKnowledgeBaseDocsQuery: (...args: unknown[]) => useKnowledgeBaseDocsQuery(...args),
}));

const indexMutate = vi.fn();
const useDocIndexStatus = vi.fn();
vi.mock("@/features/ai/use-docs", () => ({
  useIndexDocMutation: () => ({ mutate: indexMutate, isPending: false }),
  useDocIndexStatus: (...args: unknown[]) => useDocIndexStatus(...args),
}));

import { KnowledgeBaseDocs, KnowledgeBaseOverview } from "../knowledge-base-detail";

const IDLE = { isPending: false, isError: false, isFetching: false };

const DOCS = [
  { id: 71, docName: "需求文档.pdf", indexStatus: 1, creatorNickname: "林一" },
  { id: 72, docName: "设计稿.pdf", indexStatus: 0, creatorNickname: "周宁" },
];

function mockDocs(rows: unknown[]) {
  useKnowledgeBaseDocsQuery.mockReturnValue({ ...IDLE, data: { rows, total: rows.length } });
}

beforeEach(() => {
  indexMutate.mockReset();
  // 默认未轮询（未点击「建立索引」时 enabled 为 false，组件也不该读它的 data）
  useDocIndexStatus.mockReturnValue({ data: undefined });
});

describe("KnowledgeBaseDocs（D-08）", () => {
  it("页头「上传 PDF」主按钮指向带 baseId 的 PDF 问答", () => {
    mockDocs(DOCS);
    renderWithProviders(<KnowledgeBaseDocs baseId={5} />);

    expect(screen.getByTestId("kb-docs-upload")).toHaveAttribute("href", "/ai/pdf?baseId=5");
  });

  it("整行可点，href 同时带上 baseId 与 docId", () => {
    mockDocs(DOCS);
    renderWithProviders(<KnowledgeBaseDocs baseId={5} />);

    expect(screen.getByTestId("kb-doc-row-71")).toHaveAttribute(
      "href",
      "/ai/pdf?baseId=5&docId=71",
    );
    expect(screen.getByTestId("kb-doc-row-72")).toHaveAttribute(
      "href",
      "/ai/pdf?baseId=5&docId=72",
    );
  });

  it("未索引行提供「建立索引」，点击触发 mutation 并切到轮询态", async () => {
    mockDocs(DOCS);
    renderWithProviders(<KnowledgeBaseDocs baseId={5} />);

    // 未索引行有按钮，已索引行没有
    expect(screen.getByTestId("doc-index-72")).toBeInTheDocument();
    expect(screen.queryByTestId("doc-index-71")).toBeNull();

    fireEvent.click(screen.getByTestId("doc-index-72"));

    expect(indexMutate).toHaveBeenCalledTimes(1);
    expect(indexMutate.mock.calls[0]?.[0]).toBe(72);

    // 徽标换成「索引中…」，并开启轮询
    expect(await screen.findByText("索引中…")).toBeInTheDocument();
    await waitFor(() => expect(useDocIndexStatus).toHaveBeenLastCalledWith(72, { enabled: true }));
  });

  it("轮询到 indexStatus === 1 后显示已索引", async () => {
    mockDocs(DOCS);
    const { rerender } = renderWithProviders(<KnowledgeBaseDocs baseId={5} />);

    fireEvent.click(screen.getByTestId("doc-index-72"));
    expect(await screen.findByText("索引中…")).toBeInTheDocument();

    // 模拟轮询返回：后端索引完成（RocketMQ 消费后 indexStatus 变 1）
    useDocIndexStatus.mockReturnValue({ data: { indexStatus: 1 } });
    rerender(<KnowledgeBaseDocs baseId={5} />);

    // 该行不再是「索引中…」（两行都变成「已索引」）
    expect(screen.queryByText("索引中…")).toBeNull();
    expect(screen.getAllByText("已索引")).toHaveLength(2);
  });

  it("已索引的行不出现「建立索引」按钮", () => {
    mockDocs([{ id: 71, docName: "需求文档.pdf", indexStatus: 1 }]);
    renderWithProviders(<KnowledgeBaseDocs baseId={5} />);

    // 悬停才显形的按钮仍在 DOM 里，但已索引行不该渲染它
    expect(screen.queryByTestId("doc-index-71")).toBeNull();
    expect(screen.getByText("已索引")).toBeInTheDocument();
  });

  it("空态给「还没有资料」与「去上传」（带 baseId）", () => {
    mockDocs([]);
    renderWithProviders(<KnowledgeBaseDocs baseId={5} />);

    expect(screen.getByText("还没有资料")).toBeInTheDocument();
    expect(screen.getByText("上传 PDF 后可以在「PDF 问答」里围绕它提问。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去上传" })).toHaveAttribute(
      "href",
      "/ai/pdf?baseId=5",
    );
  });

  it("加载失败显示 QueryError 并可重试", async () => {
    const refetch = vi.fn();
    useKnowledgeBaseDocsQuery.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      refetch,
      error: new Error("boom"),
    });
    renderWithProviders(<KnowledgeBaseDocs baseId={5} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("资料加载失败：");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("KnowledgeBaseOverview（D-02）", () => {
  function mockBase(permissions: number | undefined) {
    useKnowledgeBaseQuery.mockReturnValue({
      ...IDLE,
      data: { id: 5, knowledgeBaseName: "产品设计", permissions },
    });
  }

  it("权限 1 / 2 显示「新建笔记」，权限 3 / 4 隐藏", () => {
    for (const [permissions, visible] of [
      [1, true],
      [2, true],
      [3, false],
      [4, false],
      [undefined, false],
    ] as const) {
      mockBase(permissions);
      mockDocs([]);
      const { unmount } = renderWithProviders(<KnowledgeBaseOverview baseId={5} />);
      if (visible) {
        expect(screen.getByTestId("kb-overview-note-create")).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId("kb-overview-note-create")).toBeNull();
      }
      unmount();
    }
  });

  it("资料块加载失败时按 Q-02 文案提示「找不到这个知识库」", () => {
    mockBase(1);
    useKnowledgeBaseDocsQuery.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error("boom"),
    });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByText("找不到这个知识库")).toBeInTheDocument();
  });

  it("资料块空态给「去上传」", () => {
    mockBase(1);
    mockDocs([]);
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(
      screen.getByText("还没有资料。上传 PDF 后可以在「PDF 问答」里围绕它提问。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去上传" })).toHaveAttribute(
      "href",
      "/ai/pdf?baseId=5",
    );
  });
});
