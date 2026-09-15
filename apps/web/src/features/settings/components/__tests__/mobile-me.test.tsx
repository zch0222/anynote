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

  it("「更多」只剩协同文档与 PDF 问答（任务、慕课已随 12.0.4 移除）", () => {
    renderWithProviders(<MobileMePage />);
    for (const [title, href] of [
      ["协同文档", "/m/docs"],
      ["PDF 问答", "/m/ai/pdf"],
    ] as const) {
      expect(screen.getByRole("link", { name: new RegExp(title) })).toHaveAttribute("href", href);
    }
    // 2026-09-15 拍板：任务与慕课只属于知识库，移动端不再有跨库入口
    expect(screen.queryByRole("link", { name: /^任务/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^慕课/ })).toBeNull();
    // 知识库已经是 tab，不再重复出现在「更多」里
    expect(screen.queryByRole("link", { name: /^知识库/ })).toBeNull();
  });

  it("资料卡整卡可点，去 /m/settings/profile", () => {
    renderWithProviders(<MobileMePage />);
    expect(screen.getByTestId("me-profile-card")).toHaveAttribute("href", "/m/settings/profile");
    expect(screen.getByTestId("me-profile-card")).toHaveTextContent("小明");
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

  it("退出登录必须先确认：第一次点击不登出", () => {
    logout.mutate.mockClear();
    renderWithProviders(<MobileMePage />);

    fireEvent.click(screen.getByTestId("mobile-logout"));
    expect(logout.mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId("mobile-action-sheet")).toBeInTheDocument();
    expect(screen.getByText("退出后需要重新输入账号密码，未保存的内容会丢失。")).toBeInTheDocument();
  });

  it("动作表里确认后才真的登出", () => {
    logout.mutate.mockClear();
    renderWithProviders(<MobileMePage />);

    fireEvent.click(screen.getByTestId("mobile-logout"));
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    expect(logout.mutate).toHaveBeenCalledTimes(1);
  });
});
