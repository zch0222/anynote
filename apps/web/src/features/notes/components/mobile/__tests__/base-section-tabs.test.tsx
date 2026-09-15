import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/notes/3/mooc",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: { id: 3, knowledgeBaseName: "我的库", type: 0 },
  })),
}));

import { MobileBaseHeader } from "@/features/notes/components/mobile/base-section-tabs";
import { renderWithProviders } from "@/test/render";

describe("MobileBaseHeader", () => {
  it("渲染库头（渐变块 + 类型）与四个 Tab", () => {
    renderWithProviders(<MobileBaseHeader baseId={3} current="mooc" />);

    expect(screen.getByTestId("mobile-base-header")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-base-tabs")).toBeInTheDocument();
    for (const key of ["notes", "mooc", "tasks", "docs"] as const) {
      expect(screen.getByTestId(`mobile-base-tab-${key}`)).toBeInTheDocument();
    }
    // 概览与成员在移动端没有页面，不进 Tab
    expect(screen.queryByTestId("mobile-base-tab-overview")).toBeNull();
    expect(screen.queryByTestId("mobile-base-tab-members")).toBeNull();
    expect(screen.getByText("普通知识库")).toBeInTheDocument();
  });

  it("当前 Tab 用 aria-current + data-active 标记", () => {
    renderWithProviders(<MobileBaseHeader baseId={3} current="tasks" />);

    expect(screen.getByTestId("mobile-base-tab-tasks")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("mobile-base-tab-tasks")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("mobile-base-tab-mooc")).toHaveAttribute("data-active", "false");
  });

  it("Tab 之间用 router.replace 切换（不入栈，返回键总是回知识库列表）", () => {
    renderWithProviders(<MobileBaseHeader baseId={3} current="notes" />);

    fireEvent.click(screen.getByTestId("mobile-base-tab-tasks"));

    expect(router.replace).toHaveBeenCalledWith("/m/notes/3/tasks");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("「笔记」Tab 走裸路径 /m/notes/:baseId", () => {
    renderWithProviders(<MobileBaseHeader baseId={3} current="mooc" />);

    fireEvent.click(screen.getByTestId("mobile-base-tab-notes"));
    expect(router.replace).toHaveBeenCalledWith("/m/notes/3");
  });

  it("带修饰键的点击交给浏览器（不拦截）", () => {
    renderWithProviders(<MobileBaseHeader baseId={3} current="notes" />);
    router.replace.mockClear();

    fireEvent.click(screen.getByTestId("mobile-base-tab-mooc"), { metaKey: true });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("href 仍然挂在链接上（键盘可达 / 可右键新标签页打开）", () => {
    renderWithProviders(<MobileBaseHeader baseId={3} current="notes" />);
    expect(screen.getByTestId("mobile-base-tab-docs")).toHaveAttribute("href", "/m/notes/3/docs");
  });
});
