import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/settings/profile",
}));

const profile = vi.hoisted(() => ({
  query: vi.fn(),
  update: { mutateAsync: vi.fn(), isPending: false },
  resetPassword: { mutateAsync: vi.fn(), isPending: false },
  validate: vi.fn(),
}));

vi.mock("@/features/settings/use-profile", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/features/settings/use-profile");
  return {
    ...actual,
    useMyProfileQuery: profile.query,
    useUpdateProfileMutation: () => profile.update,
    useResetPasswordMutation: () => profile.resetPassword,
    validateResetPassword: profile.validate,
  };
});

const theme = vi.hoisted(() => ({ setTheme: vi.fn(), theme: "light" }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: theme.theme, setTheme: theme.setTheme }),
}));

import { MobileSettingsPage } from "@/features/settings/components/mobile-settings";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false, isFetching: false };

const SERVER_PROFILE = {
  id: 1,
  username: "tester",
  nickname: "小明",
  email: "a@b.com",
  phoneNumber: "13800000000",
  sex: 0,
};

function mockProfile(value: Record<string, unknown> = SERVER_PROFILE) {
  profile.query.mockReturnValue({ ...IDLE, data: value } as never);
}

describe("MobileSettingsPage", () => {
  it.each([
    ["profile", "账号"],
    ["appearance", "外观"],
    ["ai", "AI"],
    ["integrations", "集成"],
  ] as const)("渲染 %s 分区并把分区名放进顶栏", (section, label) => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section={section} />);

    // 分区内容里也可能有同名标题（AI / 集成），顶栏那一份在 header 里
    const header = screen.getByTestId("mobile-content").previousElementSibling;
    expect(within(header as HTMLElement).getByRole("heading", { name: label })).toBeInTheDocument();
    expect(screen.getByTestId(`mobile-settings-${section}`)).toBeInTheDocument();
  });

  it("提供返回「我的」的返回键", () => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);
    expect(screen.getByTestId("mobile-back")).toBeInTheDocument();
  });
});

describe("账号分节（M-11 行表单）", () => {
  it("用 iOS 设置式行表单：标签左、值右，不复用桌面两列表单", () => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);

    expect(screen.getByTestId("settings-nickname")).toHaveValue("小明");
    expect(screen.getByTestId("settings-sex")).toHaveTextContent("男");
    expect(screen.getByTestId("settings-email")).toHaveValue("a@b.com");
    // 桌面表单的 testid 不再出现
    expect(document.querySelector("[data-testid='settings-account'] form")).toBeNull();
  });

  it("dirty 判定：与服务端一致时「保存资料」禁用，改动后启用", () => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);

    expect(screen.getByText("资料与服务器一致")).toBeInTheDocument();
    expect(screen.getByTestId("settings-save-profile")).toBeDisabled();

    fireEvent.change(screen.getByTestId("settings-nickname"), { target: { value: "小红" } });
    expect(screen.getByText("有未保存的修改")).toBeInTheDocument();
    expect(screen.getByTestId("settings-save-profile")).toBeEnabled();
  });

  it("改回原值又变回不脏（逐字段比对，不是 isDirty）", () => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);

    const input = screen.getByTestId("settings-nickname");
    fireEvent.change(input, { target: { value: "小红" } });
    fireEvent.change(input, { target: { value: "小明" } });

    expect(screen.getByText("资料与服务器一致")).toBeInTheDocument();
    expect(screen.getByTestId("settings-save-profile")).toBeDisabled();
  });

  it("性别用动作表选择，选中后值回填", () => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);

    fireEvent.click(screen.getByTestId("settings-sex"));
    expect(screen.getByTestId("mobile-action-sheet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "女" }));
    expect(screen.getByTestId("settings-sex")).toHaveTextContent("女");
  });

  it("性别「未设置」映射为 2（sys_user.sex 的口径）", async () => {
    profile.update.mutateAsync.mockClear();
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);

    fireEvent.click(screen.getByTestId("settings-sex"));
    fireEvent.click(screen.getByRole("button", { name: "未设置" }));
    fireEvent.click(screen.getByTestId("settings-save-profile"));

    await waitFor(() => expect(profile.update.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = profile.update.mutateAsync.mock.calls[0]?.[0] as {
      profile: Record<string, unknown>;
    };
    expect(payload.profile.sex).toBe(2);
  });

  it("保存 payload 是四个字段全量提交，清空邮箱传空串", async () => {
    profile.update.mutateAsync.mockClear();
    profile.update.mutateAsync.mockResolvedValue(undefined);
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);

    fireEvent.change(screen.getByTestId("settings-email"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("settings-save-profile"));

    await waitFor(() => expect(profile.update.mutateAsync).toHaveBeenCalledTimes(1));
    const { profile: payload } = profile.update.mutateAsync.mock.calls[0]?.[0] as {
      profile: Record<string, unknown>;
    };
    expect(payload.email).toBe("");
    expect(payload.nickname).toBe("小明");
    expect(payload.sex).toBe(0);
    expect(payload.phoneNumber).toBe("13800000000");
  });

  it("昵称为空时不提交，并提示", () => {
    profile.update.mutateAsync.mockClear();
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);

    fireEvent.change(screen.getByTestId("settings-nickname"), { target: { value: "  " } });
    fireEvent.click(screen.getByTestId("settings-save-profile"));
    expect(profile.update.mutateAsync).not.toHaveBeenCalled();
  });

  it("密码行带显隐切换与规则清单，规则实时打勾", () => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="profile" />);

    const input = screen.getByTestId("settings-new-password");
    expect(input).toHaveAttribute("type", "password");

    // 原密码与新密码各有一个显隐按钮，这里点第二个（新密码那一行）
    const toggles = screen.getAllByRole("button", { name: "显示密码" });
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[1] as HTMLElement);
    expect(screen.getByTestId("settings-new-password")).toHaveAttribute("type", "text");

    // 规则清单四项，初始全不通过
    const rules = within(screen.getByTestId("settings-password-rules")).getAllByRole("listitem");
    expect(rules).toHaveLength(4);
    expect(rules.every((node) => node.getAttribute("data-passed") === "false")).toBe(true);

    fireEvent.change(input, { target: { value: "Abcd1234" } });
    const passed = within(screen.getByTestId("settings-password-rules")).getAllByRole("listitem");
    expect(passed.every((node) => node.getAttribute("data-passed") === "true")).toBe(true);
  });

  it("资料加载失败走 QueryError 并可重试", () => {
    profile.query.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error("超时"),
      refetch: vi.fn(),
    } as never);
    renderWithProviders(<MobileSettingsPage section="profile" />);

    expect(screen.getByRole("alert")).toHaveTextContent("资料加载失败");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});

describe("外观分节", () => {
  it("三行单选，色块 28，点击立即生效", () => {
    theme.theme = "light";
    theme.setTheme.mockClear();
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="appearance" />);

    expect(screen.getByRole("radio", { name: /浅色/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /深色/ }));
    expect(theme.setTheme).toHaveBeenCalledWith("dark");
    // 立即生效，页面上没有保存按钮
    expect(screen.queryByRole("button", { name: /保存/ })).toBeNull();
  });
});

describe("集成与 AI 分节", () => {
  it("集成空态按 12.0.3 的文案，不出现服务名", () => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="integrations" />);

    expect(screen.getByText("暂无可用的集成")).toBeInTheDocument();
    expect(
      screen.getByText("文件存储与 AI 服务由管理员在后台配置，这里暂时没有需要你连接的服务。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/MinIO|OBS/)).toBeNull();
  });

  it("AI 分节只保留入口", () => {
    mockProfile();
    renderWithProviders(<MobileSettingsPage section="ai" />);
    expect(screen.getByText("入口保留，AI 相关页面暂时沿用现有版式。")).toBeInTheDocument();
  });
});
