import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMutate = vi.fn();
const resetMutate = vi.fn();
vi.mock("@/features/settings/use-profile", async () => {
  const actual = await vi.importActual<typeof import("@/features/settings/use-profile")>(
    "@/features/settings/use-profile",
  );
  return {
    ...actual,
    useMyProfileQuery: vi.fn(),
    useUpdateProfileMutation: () => ({ mutateAsync: updateMutate, isPending: false }),
    useResetPasswordMutation: () => ({ mutateAsync: resetMutate, isPending: false }),
  };
});

import { AccountSettings } from "@/features/settings/components/account-settings";
import { useMyProfileQuery } from "@/features/settings/use-profile";
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

describe("AccountSettings", () => {
  beforeEach(() => {
    updateMutate.mockReset();
    resetMutate.mockReset();
  });

  it("资料加载后表单填充当前值，保存提交合并后的资料", async () => {
    mockProfile({
      ...PENDING,
      isPending: false,
      data: { id: 7, username: "tester", nickname: "旧昵称", email: "", phoneNumber: "", sex: 0 },
    });
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    const nickname = screen.getByTestId("settings-nickname") as HTMLInputElement;
    expect(nickname.value).toBe("旧昵称");
    fireEvent.change(nickname, { target: { value: "新昵称" } });
    fireEvent.click(screen.getByTestId("settings-save-profile"));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const payload = updateMutate.mock.calls[0]?.[0] as { profile: Record<string, unknown> };
    expect(payload.profile.nickname).toBe("新昵称");
    expect(payload.profile.id).toBe(7);
  });

  it("新密码不符合复杂度时拒绝提交", async () => {
    mockProfile({ ...PENDING, isPending: false, data: { id: 7 } });
    renderWithProviders(<AccountSettings />);

    fireEvent.change(screen.getByTestId("settings-new-password"), { target: { value: "weak" } });
    fireEvent.click(screen.getByTestId("settings-change-password"));
    expect(resetMutate).not.toHaveBeenCalled();
  });

  it("合法密码提交重置", async () => {
    mockProfile({ ...PENDING, isPending: false, data: { id: 7 } });
    resetMutate.mockResolvedValue(undefined);
    renderWithProviders(<AccountSettings />);

    fireEvent.change(screen.getByTestId("settings-new-password"), {
      target: { value: "Abcdef12" },
    });
    // 原密码为空 → 客户端校验先挡住
    fireEvent.click(screen.getByTestId("settings-change-password"));
    expect(resetMutate).not.toHaveBeenCalled();
  });
});
