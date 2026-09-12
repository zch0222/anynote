import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/m/notes" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/features/auth/use-me", () => ({
  useMe: () => ({ isPending: false, isError: false, data: { username: "tester" } }),
}));

import { MobileShell } from "@/components/layout/mobile/mobile-shell";
import { renderWithProviders } from "@/test/render";

describe("MobileShell", () => {
  it("列表页显示底部 tab bar，五个 tab 都可达", () => {
    pathname.current = "/m/notes";
    renderWithProviders(
      <MobileShell>
        <p>内容</p>
      </MobileShell>,
    );

    const tabBar = screen.getByTestId("mobile-tab-bar");
    expect(tabBar).toBeInTheDocument();
    for (const title of ["工作台", "笔记", "文档", "AI", "我的"]) {
      expect(screen.getByRole("link", { name: title })).toBeInTheDocument();
    }
  });

  it("子路由点亮所属 tab，其余不点亮", () => {
    pathname.current = "/m/notes/3";
    renderWithProviders(
      <MobileShell>
        <p>内容</p>
      </MobileShell>,
    );
    expect(screen.getByRole("link", { name: "笔记" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "文档" })).toHaveAttribute("data-active", "false");
  });

  it("沉浸式路由隐藏 tab bar 并把可用高度还给内容", () => {
    pathname.current = "/m/notes/3/7";
    renderWithProviders(
      <MobileShell>
        <p>内容</p>
      </MobileShell>,
    );
    expect(screen.queryByTestId("mobile-tab-bar")).toBeNull();
    // data-immersive 让 CSS 把 --mobile-tabbar-h 归零
    expect(screen.getByTestId("mobile-shell")).toHaveAttribute("data-immersive", "true");
  });

  it("非沉浸式路由不带 data-immersive", () => {
    pathname.current = "/m/dashboard";
    renderWithProviders(
      <MobileShell>
        <p>内容</p>
      </MobileShell>,
    );
    expect(screen.getByTestId("mobile-shell")).not.toHaveAttribute("data-immersive");
  });

  it("提供跳到内容的无障碍快捷链接", () => {
    pathname.current = "/m/dashboard";
    renderWithProviders(
      <MobileShell>
        <p>内容</p>
      </MobileShell>,
    );
    expect(screen.getByRole("link", { name: "跳转到内容" })).toHaveAttribute(
      "href",
      "#mobile-content",
    );
  });
});
