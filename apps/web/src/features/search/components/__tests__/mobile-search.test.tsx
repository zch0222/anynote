import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/search",
}));

import { MobileSearchPage } from "@/features/search/components/mobile-search";
import { renderWithProviders } from "@/test/render";

describe("MobileSearchPage", () => {
  it("一进来就列出全部入口", () => {
    renderWithProviders(<MobileSearchPage />);
    expect(screen.getByRole("link", { name: /创建笔记/ })).toHaveAttribute("href", "/m/notes/new");
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(5);
  });

  it("输入后按标题过滤", () => {
    renderWithProviders(<MobileSearchPage />);
    fireEvent.change(screen.getByLabelText("搜索页面或操作"), { target: { value: "任务" } });

    expect(screen.getByRole("link", { name: /任务/ })).toHaveAttribute("href", "/m/tasks");
    expect(screen.queryByRole("link", { name: /^文档/ })).toBeNull();
  });

  it("没有命中时给空态", () => {
    renderWithProviders(<MobileSearchPage />);
    fireEvent.change(screen.getByLabelText("搜索页面或操作"), {
      target: { value: "不存在的页面xyz" },
    });
    expect(screen.getByText("没有找到匹配的页面")).toBeInTheDocument();
  });
});
