import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logoutMutate = vi.hoisted(() => vi.fn());
const logoutState = vi.hoisted(() => ({ isPending: false }));
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/features/auth/use-logout-mutation", () => ({
  useLogoutMutation: () => ({ mutate: logoutMutate, isPending: logoutState.isPending }),
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { LogoutSettingsCard } from "@/features/settings/components/logout-settings-card";
import { renderWithProviders } from "@/test/render";

/**
 * 桌面设置页退出登录卡片测试。
 *
 * @author 称霸幼儿园
 */
describe("LogoutSettingsCard", () => {
  beforeEach(() => {
    logoutMutate.mockReset();
    toastError.mockReset();
    logoutState.isPending = false;
  });

  /**
   * 点击入口后展示已确认的退出文案，取消时不发起退出请求。
   *
   * @author 称霸幼儿园
   */
  it("打开二次确认框，取消时不退出", async () => {
    renderWithProviders(<LogoutSettingsCard />);

    fireEvent.click(screen.getByTestId("settings-logout-button"));

    expect(screen.getByText("退出登录？")).toBeVisible();
    expect(screen.getByText("退出后需要重新输入账号密码，未保存的内容会丢失。")).toBeVisible();
    expect(screen.getByRole("button", { name: "取消" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(screen.queryByText("退出登录？")).not.toBeInTheDocument());
    expect(logoutMutate).not.toHaveBeenCalled();
  });

  /**
   * 确认退出后调用登出 mutation。
   *
   * @author 称霸幼儿园
   */
  it("确认后发起退出登录", () => {
    renderWithProviders(<LogoutSettingsCard />);

    fireEvent.click(screen.getByTestId("settings-logout-button"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "退出登录" }));

    expect(logoutMutate).toHaveBeenCalledExactlyOnceWith(
      undefined,
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  /**
   * 退出失败时关闭确认框并展示已确认的失败提示。
   *
   * @author 称霸幼儿园
   */
  it("退出失败时提示可重试", async () => {
    logoutMutate.mockImplementation((_value, options: { onError?: () => void }) => {
      options.onError?.();
    });
    renderWithProviders(<LogoutSettingsCard />);

    fireEvent.click(screen.getByTestId("settings-logout-button"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "退出登录" }));

    await waitFor(() => expect(screen.queryByText("退出登录？")).not.toBeInTheDocument());
    expect(toastError).toHaveBeenCalledExactlyOnceWith("退出登录失败，请重试");
  });

  /**
   * 退出中禁用入口并展示进行中文案。
   *
   * @author 称霸幼儿园
   */
  it("退出中禁用按钮并显示正在退出", () => {
    logoutState.isPending = true;
    renderWithProviders(<LogoutSettingsCard />);

    const button = screen.getByTestId("settings-logout-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("正在退出…");
  });
});
