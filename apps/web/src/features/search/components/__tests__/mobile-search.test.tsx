import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/search",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: [
      { id: 3, knowledgeBaseName: "产品设计" },
      { id: 5, knowledgeBaseName: "读书笔记" },
    ],
  })),
}));

import { MobileSearchPage } from "@/features/search/components/mobile-search";
import { renderWithProviders } from "@/test/render";

describe("MobileSearchPage", () => {
  it("一进来就按三组列出全部入口", () => {
    renderWithProviders(<MobileSearchPage />);

    expect(screen.getByTestId("search-group-action")).toBeInTheDocument();
    expect(screen.getByTestId("search-group-base")).toBeInTheDocument();
    expect(screen.getByTestId("search-group-page")).toBeInTheDocument();
    expect(screen.getByText("快捷操作")).toBeInTheDocument();
    // 知识库候选取自 useKnowledgeBasesQuery 的缓存
    expect(
      within(screen.getByTestId("search-group-base")).getByText("产品设计"),
    ).toBeInTheDocument();
  });

  it("行右侧只有 ›，不再显示路径", () => {
    renderWithProviders(<MobileSearchPage />);
    const create = screen.getByText("创建笔记").closest("a");
    expect(create).not.toBeNull();
    expect(create?.textContent).not.toContain("/m/notes/new");
  });

  it("输入后按标题过滤，库名能直达知识库", () => {
    renderWithProviders(<MobileSearchPage />);
    fireEvent.change(screen.getByLabelText("搜索页面、知识库或操作"), {
      target: { value: "产品" },
    });

    const base = screen.getByTestId("search-group-base");
    expect(within(base).getByRole("link", { name: /产品设计/ })).toHaveAttribute(
      "href",
      "/m/notes/3",
    );
    // 其余分组不再渲染
    expect(screen.queryByTestId("search-group-page")).toBeNull();
  });

  it("搜不到任务与慕课（已从候选集移除）", () => {
    renderWithProviders(<MobileSearchPage />);
    const input = screen.getByLabelText("搜索页面、知识库或操作");

    fireEvent.change(input, { target: { value: "任务" } });
    expect(screen.getByTestId("mobile-search-empty")).toBeInTheDocument();
  });

  it("AI 入口的副标题是「入口保留」", () => {
    renderWithProviders(<MobileSearchPage />);
    fireEvent.change(screen.getByLabelText("搜索页面、知识库或操作"), {
      target: { value: "AI 对话" },
    });
    expect(screen.getByText("入口保留")).toBeInTheDocument();
  });

  it("有输入时出现清除按钮，点了清空并保持清单", () => {
    renderWithProviders(<MobileSearchPage />);
    const input = screen.getByTestId("mobile-search-input");
    expect(screen.queryByTestId("mobile-search-clear")).toBeNull();

    fireEvent.change(input, { target: { value: "产品" } });
    const clear = screen.getByTestId("mobile-search-clear");
    // 28 命中区
    expect(clear.className).toContain("size-7");

    fireEvent.click(clear);
    expect(input).toHaveValue("");
    expect(screen.getByTestId("search-group-page")).toBeInTheDocument();
  });

  it("没有命中时给空态文案与说明", () => {
    renderWithProviders(<MobileSearchPage />);
    fireEvent.change(screen.getByLabelText("搜索页面、知识库或操作"), {
      target: { value: "不存在的页面xyz" },
    });

    expect(screen.getByText("没有找到「不存在的页面xyz」")).toBeInTheDocument();
    expect(screen.getByText("搜索只覆盖页面与知识库名称，笔记正文暂不支持。")).toBeInTheDocument();
  });

  it("无结果时「用「q」新建笔记」只在查询词 3–15 字出现", () => {
    renderWithProviders(<MobileSearchPage />);
    const input = screen.getByLabelText("搜索页面、知识库或操作");

    // 2 个字：不出现
    fireEvent.change(input, { target: { value: "周报" } });
    expect(screen.queryByTestId("mobile-search-create-note")).toBeNull();

    // 4 个字：出现，且带预填标题
    fireEvent.change(input, { target: { value: "周报模板" } });
    const link = screen.getByTestId("mobile-search-create-note");
    expect(link).toHaveAttribute("href", `/m/notes/new?title=${encodeURIComponent("周报模板")}`);

    // 16 个字：不出现
    fireEvent.change(input, { target: { value: "周".repeat(16) } });
    expect(screen.queryByTestId("mobile-search-create-note")).toBeNull();
  });
});
