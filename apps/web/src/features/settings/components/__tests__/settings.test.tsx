import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme }),
}));

import { AiSettings } from "@/features/settings/components/ai-settings";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { renderWithProviders } from "@/test/render";

describe("AppearanceSettings", () => {
  beforeEach(() => {
    setTheme.mockClear();
  });

  it("三个主题选项点击后调用 setTheme", () => {
    renderWithProviders(<AppearanceSettings />);
    fireEvent.click(screen.getByTestId("theme-option-dark"));
    expect(setTheme).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByTestId("theme-option-system"));
    expect(setTheme).toHaveBeenCalledWith("system");
    // 当前 theme=light，选项呈选中态
    expect(screen.getByTestId("theme-option-light").getAttribute("aria-checked")).toBe("true");
  });
});

describe("AiSettings", () => {
  it("切换模型持久化到 localStorage 并提示", () => {
    renderWithProviders(<AiSettings />);
    fireEvent.click(screen.getByTestId("model-option-deepseek_gpt-4o-mini"));
    expect(window.localStorage.getItem("anynote-ai-model")).toBe("deepseek_gpt-4o-mini");
    expect(
      screen.getByTestId("model-option-deepseek_gpt-4o-mini").getAttribute("aria-checked"),
    ).toBe("true");
  });
});

describe("SettingsPage", () => {
  it("子导航渲染四个分区并高亮当前", () => {
    renderWithProviders(<SettingsPage section="profile" />);
    expect(screen.getByTestId("settings-nav-profile").getAttribute("data-testid")).toBe(
      "settings-nav-profile",
    );
    expect(screen.getByTestId("settings-nav-appearance")).toBeTruthy();
    expect(screen.getByTestId("settings-nav-ai")).toBeTruthy();
    expect(screen.getByTestId("settings-nav-integrations")).toBeTruthy();
  });

  it("按 section 渲染对应面板", () => {
    renderWithProviders(<SettingsPage section="integrations" />);
    expect(screen.getByTestId("settings-integrations")).toBeTruthy();
    expect(screen.queryByTestId("settings-appearance")).toBeNull();
  });
});
