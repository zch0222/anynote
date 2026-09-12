import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/settings/profile",
}));

// 四个分区组件各自有自己的数据依赖，这里只验证"哪个分区被渲染 + 外框正确"
vi.mock("@/features/settings/components/account-settings", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "@/features/settings/components/account-settings",
  );
  return {
    ...actual,
    AccountSettings: () => <div data-testid="section-profile" />,
  };
});
vi.mock("@/features/settings/components/appearance-settings", () => ({
  AppearanceSettings: () => <div data-testid="section-appearance" />,
}));
vi.mock("@/features/settings/components/ai-settings", () => ({
  AiSettings: () => <div data-testid="section-ai" />,
}));
vi.mock("@/features/settings/components/integrations-settings", () => ({
  IntegrationsSettings: () => <div data-testid="section-integrations" />,
}));

import { MobileSettingsPage } from "@/features/settings/components/mobile-settings";
import { renderWithProviders } from "@/test/render";

describe("MobileSettingsPage", () => {
  it.each([
    ["profile", "账号"],
    ["appearance", "外观"],
    ["ai", "AI"],
    ["integrations", "集成"],
  ] as const)("渲染 %s 分区并把分区名放进顶栏", (section, label) => {
    renderWithProviders(<MobileSettingsPage section={section} />);

    expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    expect(screen.getByTestId(`section-${section}`)).toBeInTheDocument();
    expect(screen.getByTestId(`mobile-settings-${section}`)).toBeInTheDocument();
  });

  it("只渲染当前分区，不把四个分区一起挂上", () => {
    renderWithProviders(<MobileSettingsPage section="ai" />);
    expect(screen.queryByTestId("section-profile")).toBeNull();
    expect(screen.queryByTestId("section-appearance")).toBeNull();
  });

  it("提供返回「我的」的返回键", () => {
    renderWithProviders(<MobileSettingsPage section="profile" />);
    expect(screen.getByTestId("mobile-back")).toBeInTheDocument();
  });
});
