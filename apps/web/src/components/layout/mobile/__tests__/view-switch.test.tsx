import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/m/notes/3/7" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

import { ViewSwitch } from "@/components/layout/mobile/view-switch";
import { renderWithProviders } from "@/test/render";

describe("ViewSwitch", () => {
  it("在移动端指向对应的桌面路由，并带 ?desktop=1 记住选择", () => {
    pathname.current = "/m/notes/3/7";
    renderWithProviders(<ViewSwitch />);

    const link = screen.getByTestId("view-switch");
    expect(link).toHaveAttribute("href", "/notes/3/7?desktop=1");
    expect(link).toHaveTextContent("切换到桌面版");
  });

  it("在桌面端指向对应的移动端路由，并带 ?mobile=1", () => {
    pathname.current = "/notes/3/7";
    renderWithProviders(<ViewSwitch />);

    const link = screen.getByTestId("view-switch");
    expect(link).toHaveAttribute("href", "/m/notes/3/7?mobile=1");
    expect(link).toHaveTextContent("切换到手机版");
  });

  it("桌面页面没有移动端对应版本时回退到移动端工作台", () => {
    // 决策 4：/ai/workflow 移动端不提供
    pathname.current = "/ai/workflow";
    renderWithProviders(<ViewSwitch />);
    expect(screen.getByTestId("view-switch")).toHaveAttribute("href", "/m/dashboard?mobile=1");
  });

  it("移动端独有页面回退到最接近的桌面页", () => {
    pathname.current = "/m/me";
    renderWithProviders(<ViewSwitch />);
    expect(screen.getByTestId("view-switch")).toHaveAttribute(
      "href",
      "/settings/profile?desktop=1",
    );
  });
});
