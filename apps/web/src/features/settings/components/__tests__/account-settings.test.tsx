import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMutate = vi.hoisted(() => vi.fn());
const resetMutate = vi.hoisted(() => vi.fn());
/** toast 是副作用出口，不是 DOM：仓库里没有挂 Toaster，所以断言打到调用上。 */
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
  Toaster: () => null,
}));
vi.mock("@/features/settings/use-profile", async () => {
  const actual = await vi.importActual<typeof import("@/features/settings/use-profile")>(
    "@/features/settings/use-profile",
  );
  return {
    ...actual,
    useMyProfileQuery: vi.fn(),
    useUpdateMyProfileMutation: () => ({ mutateAsync: updateMutate, isPending: false }),
    useResetPasswordMutation: () => ({ mutateAsync: resetMutate, isPending: false }),
  };
});

import { AccountSettings } from "@/features/settings/components/account-settings";
import { isProfileDirty, toProfileForm, useMyProfileQuery } from "@/features/settings/use-profile";
import { renderWithProviders } from "@/test/render";

function mockProfile(returnValue: Record<string, unknown>) {
  vi.mocked(useMyProfileQuery).mockReturnValue(returnValue as never);
}

const PENDING = {
  isPending: true,
  isError: false,
  data: undefined,
  error: undefined as unknown as Error,
};

/** 服务端的一份完整资料；用例按需覆盖单个字段即可。 */
const SERVER = {
  id: 7,
  username: "tester",
  nickname: "旧昵称",
  email: "old@example.com",
  phoneNumber: "13800000000",
  sex: 0,
};

function show(overrides: Record<string, unknown> = {}) {
  mockProfile({ ...PENDING, isPending: false, data: { ...SERVER, ...overrides } });
}

const nickname = () => screen.getByTestId("settings-nickname") as HTMLInputElement;
const email = () => screen.getByTestId("settings-email") as HTMLInputElement;
const saveButton = () => screen.getByTestId("settings-save-profile");
const dirtyHint = () => screen.queryByTestId("profile-dirty-hint");

/** 打开 Select 并选中一项（base-ui 的 item 需要先 pointerdown 才认作鼠标点击）。 */
async function selectSex(label: string) {
  fireEvent.pointerDown(screen.getByTestId("settings-sex"), { button: 0 });
  fireEvent.click(screen.getByTestId("settings-sex"));
  const option = await screen.findByRole("option", { name: label });
  fireEvent.pointerDown(option, { pointerType: "mouse" });
  fireEvent.click(option);
}

beforeEach(() => {
  updateMutate.mockReset();
  resetMutate.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("资料表单（D-12）", () => {
  it("加载后表单填充当前值", () => {
    show();
    renderWithProviders(<AccountSettings />);

    expect(nickname().value).toBe("旧昵称");
    expect(email().value).toBe("old@example.com");
    expect(screen.getByTestId("settings-phone")).toHaveValue("13800000000");
  });

  it("用户名只读：锁图标 + 「不可修改」，且不是输入框", () => {
    show();
    renderWithProviders(<AccountSettings />);

    expect(screen.getByText(/用户名 tester · 不可修改/)).toBeInTheDocument();
    const usernameBlock = screen.getByText(/用户名 tester/).closest("p");
    expect(usernameBlock?.querySelector("svg")).not.toBeNull();
    // 图例 11：它是一行说明而不是表单字段
    expect(screen.queryByLabelText("用户名")).not.toBeInTheDocument();
  });

  it("昵称显示 N / 30 计数", () => {
    show({ nickname: "三个字" });
    renderWithProviders(<AccountSettings />);

    expect(screen.getByTestId("nickname-count")).toHaveTextContent("3 / 30");

    fireEvent.change(nickname(), { target: { value: "更长的昵称" } });
    expect(screen.getByTestId("nickname-count")).toHaveTextContent("5 / 30");
  });

  it("与服务端一致时隐藏未保存提示并禁用保存", () => {
    show();
    renderWithProviders(<AccountSettings />);

    expect(dirtyHint()).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  it("改动后出现提示并启用保存；改回原值又复原", () => {
    show();
    renderWithProviders(<AccountSettings />);

    fireEvent.change(nickname(), { target: { value: "新昵称" } });
    expect(dirtyHint()).toHaveTextContent("有未保存的修改");
    expect(saveButton()).toBeEnabled();

    // 「改了又改回来」不该一直说"有未保存的修改"——点保存什么都不会变
    fireEvent.change(nickname(), { target: { value: "旧昵称" } });
    expect(dirtyHint()).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  it("只多打一个空格不算修改（提交前会 trim）", () => {
    show();
    renderWithProviders(<AccountSettings />);

    fireEvent.change(nickname(), { target: { value: "旧昵称  " } });
    expect(saveButton()).toBeDisabled();
  });

  it("保存只提交四个白名单字段，不携带 id", async () => {
    show();
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    fireEvent.change(nickname(), { target: { value: "新昵称" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0]?.[0]).toEqual({
      nickname: "新昵称",
      sex: 0,
      email: "old@example.com",
      phoneNumber: "13800000000",
    });
  });

  it("清空邮箱时 payload 是空串（B-3：空串 = 清空，不能被过滤掉）", async () => {
    show();
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    fireEvent.change(email(), { target: { value: "" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const payload = updateMutate.mock.calls[0]?.[0] as { email: string };
    expect(payload.email).toBe("");
  });

  it("清空手机号同样传空串", async () => {
    show();
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    fireEvent.change(screen.getByTestId("settings-phone"), { target: { value: "  " } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect((updateMutate.mock.calls[0]?.[0] as { phoneNumber: string }).phoneNumber).toBe("");
  });

  it("昵称清空后拒绝提交，不把空昵称发给后端", async () => {
    show();
    renderWithProviders(<AccountSettings />);

    fireEvent.change(nickname(), { target: { value: "" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("请填写昵称"));
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("保存失败时保留输入", async () => {
    show();
    updateMutate.mockRejectedValue(new Error("昵称已被占用"));
    renderWithProviders(<AccountSettings />);

    fireEvent.change(nickname(), { target: { value: "抢手昵称" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("昵称已被占用"));
    expect(nickname().value).toBe("抢手昵称");
  });

  it("无未设置态用 2 表示，不是 null", async () => {
    show({ sex: null });
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    // 未设置也要能保存：null 会被后端 @NotNull 拒掉
    expect(screen.getByTestId("settings-sex")).toHaveTextContent("未设置");
    // 未设置与服务端的 null 等价 → 一开始不算脏
    expect(saveButton()).toBeDisabled();

    fireEvent.change(nickname(), { target: { value: "改一下" } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect((updateMutate.mock.calls[0]?.[0] as { sex: number }).sex).toBe(2);
  });

  it("性别选「女」提交 1", async () => {
    show();
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    await selectSex("女");
    await waitFor(() => expect(screen.getByTestId("settings-sex")).toHaveTextContent("女"));
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect((updateMutate.mock.calls[0]?.[0] as { sex: number }).sex).toBe(1);
  });

  it("把性别改回「未设置」也算修改，提交 2", async () => {
    show({ sex: 1 });
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    await selectSex("未设置");
    expect(dirtyHint()).toHaveTextContent("有未保存的修改");
    fireEvent.click(saveButton());

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect((updateMutate.mock.calls[0]?.[0] as { sex: number }).sex).toBe(2);
  });
});

describe("资料加载失败（D-12 图例 28）", () => {
  it("走 QueryError 并带重试", () => {
    const refetch = vi.fn();
    mockProfile({
      isPending: false,
      isError: true,
      data: undefined,
      error: new Error("网络连接超时，请检查网络后重试"),
      refetch,
      isFetching: false,
    });
    renderWithProviders(<AccountSettings />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("资料加载失败：网络连接超时，请检查网络后重试");
    fireEvent.click(within(alert).getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("改密码（D-12 图例 23 · 24）", () => {
  function setPassword(value: string) {
    fireEvent.change(screen.getByTestId("settings-new-password"), { target: { value } });
  }
  const ruleStates = () =>
    within(screen.getByTestId("settings-password-rules"))
      .getAllByRole("listitem")
      .map((item) => `${item.textContent}:${item.getAttribute("data-passed")}`);

  it("密码输入都是可显隐的密码框", () => {
    show();
    renderWithProviders(<AccountSettings />);

    const passwordInputs = document.querySelectorAll('[data-slot="password-input"]');
    expect(passwordInputs.length).toBe(2);
    for (const input of passwordInputs) {
      expect(input).toHaveAttribute("type", "password");
    }
    expect(document.querySelectorAll('[data-slot="password-input-toggle"]').length).toBe(2);
  });

  it("密码显隐能切换 type", () => {
    show();
    renderWithProviders(<AccountSettings />);

    const toggle = document.querySelectorAll('[data-slot="password-input-toggle"]')[0] as Element;
    expect(toggle).toHaveAttribute("aria-label", "显示密码");
    fireEvent.click(toggle);
    expect(document.querySelectorAll('[data-slot="password-input"]')[0]).toHaveAttribute(
      "type",
      "text",
    );
    expect(toggle).toHaveAttribute("aria-label", "隐藏密码");
  });

  it("规则清单四项随输入实时打勾", () => {
    show();
    renderWithProviders(<AccountSettings />);

    // 初始全不满足
    expect(ruleStates()).toEqual([
      "8–15 位:false",
      "含大写字母:false",
      "含小写字母:false",
      "含数字:false",
    ]);

    setPassword("abcdefgh");
    expect(ruleStates()).toEqual([
      "8–15 位:true",
      "含大写字母:false",
      "含小写字母:true",
      "含数字:false",
    ]);

    setPassword("Abcdef12");
    expect(ruleStates().every((state) => state.endsWith("true"))).toBe(true);
  });

  it("超过 15 位时长度那条重新变成不满足", () => {
    show();
    renderWithProviders(<AccountSettings />);

    setPassword("Abcdef1234567890");
    expect(ruleStates()[0]).toBe("8–15 位:false");
  });

  it("规则不满足时拒绝提交", async () => {
    show();
    renderWithProviders(<AccountSettings />);

    fireEvent.change(screen.getByLabelText("原密码"), { target: { value: "OldPass1" } });
    setPassword("weak");
    fireEvent.click(screen.getByTestId("settings-change-password"));

    expect(resetMutate).not.toHaveBeenCalled();
  });

  it("合法输入提交，成功后清空两个字段", async () => {
    show();
    resetMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    fireEvent.change(screen.getByLabelText("原密码"), { target: { value: "OldPass1" } });
    setPassword("Abcdef12");
    fireEvent.click(screen.getByTestId("settings-change-password"));

    await waitFor(() =>
      expect(resetMutate).toHaveBeenCalledWith({
        oldPassword: "OldPass1",
        newPassword: "Abcdef12",
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("原密码")).toHaveValue(""));
    expect(screen.getByTestId("settings-new-password")).toHaveValue("");
  });

  it("原密码错误落到原密码字段下方，而不是只弹 toast", async () => {
    show();
    resetMutate.mockRejectedValue(new Error("重置密码失败，旧密码错误"));
    renderWithProviders(<AccountSettings />);

    fireEvent.change(screen.getByLabelText("原密码"), { target: { value: "WrongPass1" } });
    setPassword("Abcdef12");
    fireEvent.click(screen.getByTestId("settings-change-password"));

    const fieldError = await screen.findByTestId("settings-old-password-error");
    expect(fieldError).toHaveTextContent("重置密码失败，旧密码错误");
    // 落到字段下方要求与输入框建立 aria 关联，否则读屏听不到
    expect(screen.getByLabelText("原密码")).toHaveAttribute(
      "aria-describedby",
      "settings-old-password-error",
    );
  });

  it("重新输入原密码时清掉字段错误", async () => {
    show();
    resetMutate.mockRejectedValue(new Error("重置密码失败，旧密码错误"));
    renderWithProviders(<AccountSettings />);

    fireEvent.change(screen.getByLabelText("原密码"), { target: { value: "WrongPass1" } });
    setPassword("Abcdef12");
    fireEvent.click(screen.getByTestId("settings-change-password"));
    await screen.findByTestId("settings-old-password-error");

    fireEvent.change(screen.getByLabelText("原密码"), { target: { value: "WrongPass12" } });
    expect(screen.queryByTestId("settings-old-password-error")).toBeNull();
  });

  it("非「旧密码」类失败仍然走 toast（不把网络问题塞进字段）", async () => {
    show();
    resetMutate.mockRejectedValue(new Error("网络连接超时，请检查网络后重试"));
    renderWithProviders(<AccountSettings />);

    fireEvent.change(screen.getByLabelText("原密码"), { target: { value: "OldPass1" } });
    setPassword("Abcdef12");
    fireEvent.click(screen.getByTestId("settings-change-password"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("网络连接超时，请检查网络后重试"));
    expect(screen.queryByTestId("settings-old-password-error")).toBeNull();
  });
});

describe("isProfileDirty / toProfileForm（纯函数）", () => {
  it("null 的 sex 与服务端的未设置等价", () => {
    expect(toProfileForm({ sex: null }).sex).toBe(2);
    expect(toProfileForm({ sex: undefined }).sex).toBe(2);
    expect(isProfileDirty(toProfileForm({ sex: null }), { sex: null })).toBe(false);
  });

  it("缺字段按空串处理", () => {
    expect(toProfileForm(undefined)).toEqual({
      nickname: "",
      sex: 2,
      email: "",
      phoneNumber: "",
    });
  });

  it("任一字段不同即为脏", () => {
    const base = { nickname: "a", sex: 0, email: "e", phoneNumber: "p" };
    expect(isProfileDirty(base, { ...base })).toBe(false);
    expect(isProfileDirty({ ...base, email: "" }, base)).toBe(true);
    expect(isProfileDirty({ ...base, sex: 2 }, base)).toBe(true);
  });
});
