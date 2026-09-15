import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.hoisted(() => vi.fn());
/** 可取值的当前主题：说明文案要按 theme 与系统色的组合分别断言。 */
const themeState = vi.hoisted(() => ({ current: "light" as string | undefined }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: themeState.current, setTheme }),
}));

/** 可改的 `matchMedia` 结果：系统色用例要能来回切。 */
const media = vi.hoisted(() => ({ dark: false }));

import { AiSettings } from "@/features/settings/components/ai-settings";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { IntegrationsSettings } from "@/features/settings/components/integrations-settings";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { renderWithProviders } from "@/test/render";

beforeEach(() => {
  media.dark = false;
  themeState.current = "light";
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-color-scheme: dark") ? media.dark : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
});

describe("AppearanceSettings（D-13 图例 3 · 5）", () => {
  it("三张带预览的单选卡，点了立即生效", () => {
    renderWithProviders(<AppearanceSettings />);

    expect(screen.getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByTestId("theme-option-dark"));
    expect(setTheme).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByTestId("theme-option-system"));
    expect(setTheme).toHaveBeenCalledWith("system");
    // 当前 theme=light，只有它呈选中态
    expect(screen.getByTestId("theme-option-light").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("theme-option-dark").getAttribute("aria-checked")).toBe("false");
  });

  it("是 radiogroup 而不是三个独立开关", () => {
    renderWithProviders(<AppearanceSettings />);

    const group = screen.getByRole("radiogroup", { name: "主题" });
    expect(group).toBeInTheDocument();
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
  });

  it("方向键切换主题", () => {
    renderWithProviders(<AppearanceSettings />);

    const group = screen.getByRole("radiogroup", { name: "主题" });
    screen.getByTestId("theme-option-light").focus();

    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(setTheme).toHaveBeenLastCalledWith("dark");

    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(setTheme).toHaveBeenLastCalledWith("system");

    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(setTheme).toHaveBeenLastCalledWith("dark");

    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(setTheme).toHaveBeenLastCalledWith("system");
  });

  it("Home / End 跳到首尾", () => {
    renderWithProviders(<AppearanceSettings />);

    const group = screen.getByRole("radiogroup", { name: "主题" });
    fireEvent.keyDown(group, { key: "End" });
    expect(setTheme).toHaveBeenLastCalledWith("system");
    fireEvent.keyDown(group, { key: "Home" });
    expect(setTheme).toHaveBeenLastCalledWith("light");
  });

  it("其它按键不改变主题", () => {
    renderWithProviders(<AppearanceSettings />);

    fireEvent.keyDown(screen.getByRole("radiogroup", { name: "主题" }), { key: "a" });
    expect(setTheme).not.toHaveBeenCalled();
  });

  it("说明同时讲清系统色、当前生效色与偏好只在本机", async () => {
    renderWithProviders(<AppearanceSettings />);

    await waitFor(() =>
      expect(screen.getByTestId("appearance-effective")).toHaveTextContent(
        "当前系统为浅色，界面正在使用浅色。偏好只保存在这台设备的浏览器里。",
      ),
    );
  });

  it("跟随系统且系统是深色时，界面生效色也是深色", async () => {
    media.dark = true;
    themeState.current = "system";
    renderWithProviders(<AppearanceSettings />);

    await waitFor(() =>
      expect(screen.getByTestId("appearance-effective")).toHaveTextContent(
        "当前系统为深色，界面正在使用深色。偏好只保存在这台设备的浏览器里。",
      ),
    );
  });

  it("显式选了浅色时，即使系统是深色也说界面在用浅色", async () => {
    media.dark = true;
    themeState.current = "light";
    renderWithProviders(<AppearanceSettings />);

    await waitFor(() =>
      expect(screen.getByTestId("appearance-effective")).toHaveTextContent(
        "当前系统为深色，界面正在使用浅色。偏好只保存在这台设备的浏览器里。",
      ),
    );
  });

  it("跟随系统且系统是浅色时，界面生效色是浅色", async () => {
    media.dark = false;
    themeState.current = "system";
    renderWithProviders(<AppearanceSettings />);

    await waitFor(() =>
      expect(screen.getByTestId("appearance-effective")).toHaveTextContent(
        "当前系统为浅色，界面正在使用浅色。偏好只保存在这台设备的浏览器里。",
      ),
    );
  });
});

describe("IntegrationsSettings（D-13 图例 7）", () => {
  it("空态文案照抄文案表，且不点名任何内部服务", () => {
    renderWithProviders(<IntegrationsSettings />);

    expect(screen.getByText("暂无可用的集成")).toBeInTheDocument();
    expect(
      screen.getByText("文件存储与 AI 服务由管理员在后台配置，这里暂时没有需要你连接的服务。"),
    ).toBeInTheDocument();
    // 旧文案点名 MinIO / 华为 OBS——面向开发者，不该出现在用户界面
    expect(document.body.textContent).not.toMatch(/MinIO|OBS/i);
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
    expect(screen.getByTestId("settings-nav-profile")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("settings-nav-appearance")).not.toHaveAttribute("aria-current");
    expect(screen.getByTestId("settings-nav-ai")).toBeTruthy();
    expect(screen.getByTestId("settings-nav-integrations")).toBeTruthy();
  });

  it("按 section 渲染对应面板", async () => {
    renderWithProviders(<SettingsPage section="integrations" />);
    // 四个分区各自 dynamic(..., { ssr: false })：只有当前分区的代码会被下载，
    // 所以这里要等它挂上（这正是省首屏预算的手段）。
    expect(await screen.findByTestId("settings-integrations")).toBeTruthy();
    expect(screen.queryByTestId("settings-appearance")).toBeNull();
  });
});
