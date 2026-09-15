import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KnowledgeBaseGallery } from "../knowledge-base-gallery";

/**
 * 画廊的**版式**（设计稿 p03）与 selection 逻辑分开测：
 * 上面那份用例钉数据口径，这一份钉"页头写了什么、卡片长什么样"。
 */

const bases = vi.hoisted(() => ({
  data: [
    { id: 11, knowledgeBaseName: "产品设计知识库", detail: "128 篇笔记" },
    { id: 22, knowledgeBaseName: "算法与工程实践", detail: "" },
  ] as { id: number; knowledgeBaseName: string; detail: string }[],
  isPending: false,
  isError: false,
  isFetching: false,
  error: null as Error | null,
  refetch: vi.fn(),
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: () => bases,
  useManagedKnowledgeBasesQuery: () => ({ ...bases, data: [] }),
  useOrganizationKnowledgeBasesQuery: () => ({ ...bases, data: [] }),
  // 新建对话框是画廊里的一个触发点，本文件只测版式，把它打桩掉
  useCreateKnowledgeBaseMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/features/auth/use-me", () => ({
  useMe: () => ({ data: { id: 1 }, isPending: false, isError: false }),
}));
// CreateBaseDialog 会读 router / pathname 决定创建成功后的落点；
// 少了这个 mock 会报 "invariant expected app router to be mounted"
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/notes",
}));

describe("知识库画廊版式", () => {
  it("页头用 Display 字阶，副标题只报知识库个数", () => {
    renderWithProviders(<KnowledgeBaseGallery />);

    const title = screen.getByRole("heading", { level: 1, name: "知识库" });
    expect(title).toHaveClass("text-display");

    // 「共 N 个知识库」在页头与分组标题里各出现一次，这里只断言页头那份
    const header = title.closest("header");
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByText("共 2 个知识库")).toBeInTheDocument();
    // 后端没有跨知识库的聚合端点，副标题不该出现笔记/慕课/任务数
    expect(within(header as HTMLElement).queryByText(/篇笔记/)).toBeNull();
  });

  it("有卡片时给出「最近访问」分组标题与计数", () => {
    renderWithProviders(<KnowledgeBaseGallery />);

    const group = screen.getByRole("heading", { level: 2, name: /最近访问/ });
    expect(within(group).getByText("共 2 个知识库")).toBeInTheDocument();
    // 分组标题排在网格之前
    const grid = screen.getByTestId("kb-gallery-grid");
    expect(group.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("卡片封面是内嵌的（有圆角），不是通栏出血", () => {
    renderWithProviders(<KnowledgeBaseGallery />);

    const cover = screen.getByTestId("kb-card-11").querySelector("span.kb-cover");
    expect(cover).not.toBeNull();
    expect(cover).toHaveClass("rounded-md");
    // 卡片自身带内边距，封面因此四周留白
    expect(screen.getByTestId("kb-card-11")).toHaveClass("p-3");
  });

  it("加载中不渲染分组标题与网格", () => {
    bases.isPending = true;
    renderWithProviders(<KnowledgeBaseGallery />);
    expect(screen.queryByRole("heading", { level: 2, name: /最近访问/ })).toBeNull();
    expect(screen.queryByTestId("kb-gallery-grid")).toBeNull();
    bases.isPending = false;
  });

  it("空态不渲染分组标题——没有卡片就无所谓分组", () => {
    const original = bases.data;
    bases.data = [];
    renderWithProviders(<KnowledgeBaseGallery />);

    expect(screen.queryByRole("heading", { level: 2, name: /最近访问/ })).toBeNull();
    // 空态文案在页头（副标题）与空态卡片里各有一份，这里断言的是空态卡片
    expect(
      screen.getByText("先建一个知识库，笔记、慕课与任务都会归到它下面。"),
    ).toBeInTheDocument();
    bases.data = original;
  });

  it("出错 → 点重试 → 重新请求（12.0.3：24 处错误态都必须能重试）", async () => {
    bases.isError = true;
    bases.error = new Error("网络异常");
    renderWithProviders(<KnowledgeBaseGallery />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("知识库加载失败：网络异常");
    // 出错时不该同时给出"还没有知识库"的空态——那会把失败说成没数据
    expect(screen.queryByText("先建一个知识库，笔记、慕课与任务都会归到它下面。")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(bases.refetch).toHaveBeenCalledTimes(1);

    bases.isError = false;
    bases.error = null;
  });

  it("重试中按钮禁用并转圈，避免重复发请求", () => {
    bases.isError = true;
    bases.error = new Error("网络异常");
    bases.isFetching = true;
    renderWithProviders(<KnowledgeBaseGallery />);

    const button = screen.getByRole("button", { name: /重试中…/ });
    expect(button).toBeDisabled();

    bases.isError = false;
    bases.error = null;
    bases.isFetching = false;
  });

  it("实现细节不外泄：collab 字样被换成兜底文案", async () => {
    bases.isError = true;
    bases.error = new Error("请确认 collab 服务已启动");
    renderWithProviders(<KnowledgeBaseGallery />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("知识库加载失败：服务暂时不可用，请稍后重试");
    expect(alert).not.toHaveTextContent("collab");

    bases.isError = false;
    bases.error = null;
  });
});
