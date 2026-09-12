import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/me",
}));

vi.mock("@/features/auth/use-me", () => ({
  useMe: () => ({
    isPending: false,
    isError: false,
    data: { username: "tester", nickname: "小明" },
  }),
}));

const logout = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock("@/features/auth/use-logout-mutation", () => ({
  useLogoutMutation: () => logout,
}));

import { MobileMePage } from "@/features/settings/components/mobile-me";
import { renderWithProviders } from "@/test/render";

describe("MobileMePage", () => {
  it("展示昵称与用户名", () => {
    renderWithProviders(<MobileMePage />);
    expect(screen.getByText("小明")).toBeInTheDocument();
    expect(screen.getByText("@tester")).toBeInTheDocument();
  });

  it("四个设置分区都指向移动端子页", () => {
    renderWithProviders(<MobileMePage />);
    expect(screen.getByTestId("me-settings-profile")).toHaveAttribute(
      "href",
      "/m/settings/profile",
    );
    expect(screen.getByTestId("me-settings-appearance")).toHaveAttribute(
      "href",
      "/m/settings/appearance",
    );
    expect(screen.getByTestId("me-settings-ai")).toHaveAttribute("href", "/m/settings/ai");
    expect(screen.getByTestId("me-settings-integrations")).toHaveAttribute(
      "href",
      "/m/settings/integrations",
    );
  });

  it("tab 放不下的入口都在「更多」里，且都是移动端地址", () => {
    renderWithProviders(<MobileMePage />);
    for (const [title, href] of [
      ["知识库", "/m/wikis"],
      ["任务", "/m/tasks"],
      ["课程", "/m/mooc"],
      ["PDF 问答", "/m/ai/pdf"],
    ] as const) {
      expect(screen.getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", href);
    }
  });

  it("仅桌面版的能力给出理由与带逃生口的链接（决策 4）", () => {
    renderWithProviders(<MobileMePage />);
    const link = screen.getByRole("link", { name: /AI 工作流/ });
    expect(link).toHaveAttribute("href", "/ai/workflow?desktop=1");
    expect(screen.getByText("画布需要拖拽与大屏，请在桌面版使用。")).toBeInTheDocument();
  });

  it("提供切换到桌面版的入口", () => {
    renderWithProviders(<MobileMePage />);
    expect(screen.getByTestId("view-switch")).toHaveAttribute(
      "href",
      "/settings/profile?desktop=1",
    );
  });

  it("退出登录调用登出 mutation", () => {
    renderWithProviders(<MobileMePage />);
    fireEvent.click(screen.getByTestId("mobile-logout"));
    expect(logout.mutate).toHaveBeenCalledTimes(1);
  });
});
