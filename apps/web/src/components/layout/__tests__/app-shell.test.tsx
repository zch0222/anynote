import { ApiError } from "@/lib/api/errors";
import { useUIStore } from "@/stores/ui-store";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../app-shell";

const { push, replace, setTheme, refetch, mutate, profile } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  setTheme: vi.fn(),
  refetch: vi.fn(),
  mutate: vi.fn(),
  profile: {
    data: { nickname: "测试用户", username: "tester", avatar: null },
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/notes/new",
  useRouter: () => ({ push, replace }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme }) }));
vi.mock("@/features/auth/use-me", () => ({ useMe: () => ({ ...profile, refetch }) }));
vi.mock("@/features/auth/use-logout-mutation", () => ({
  useLogoutMutation: () => ({ mutate, isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  profile.isError = false;
  profile.isPending = false;
  profile.error = null;
  localStorage.clear();
  useUIStore.setState({ sidebarOpen: true, commandPaletteOpen: false });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});

describe("AppShell 交互", () => {
  it("导航、面包屑、分组折叠与侧栏持久化", async () => {
    render(
      <AppShell>
        <h1>页面内容</h1>
      </AppShell>,
    );
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).getByRole("link", { name: "笔记" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getAllByRole("link")).toHaveLength(9);
    expect(
      within(screen.getByRole("navigation", { name: "面包屑" })).getByText("创建笔记"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 助手" }));
    expect(within(navigation).queryByRole("link", { name: "AI 对话" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI 助手" }));
    expect(within(navigation).getByRole("link", { name: "AI 对话" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "切换侧边栏" }));
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    expect(document.cookie).toBe("");
    expect(JSON.parse(localStorage.getItem("anynote-ui") || "{}").state).toEqual({
      sidebarOpen: false,
    });
  });

  it("Ctrl+K 搜索并执行路由跳转，关闭面板", async () => {
    render(<AppShell>内容</AppShell>);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: "搜索页面或操作" });
    fireEvent.change(input, { target: { value: "PDF" } });
    fireEvent.click(await screen.findByRole("option", { name: "PDF 问答" }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/ai/pdf");
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it("Cmd+K 可切换开关，空搜索显示提示，新建动作进入占位页", async () => {
    render(<AppShell>内容</AppShell>);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await screen.findByRole("combobox");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "打开命令面板" }));
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "不存在xyz" } });
    expect(await screen.findByText("没有找到匹配的操作")).toBeVisible();
    fireEvent.change(input, { target: { value: "创建笔记" } });
    fireEvent.click(await screen.findByRole("option", { name: "创建笔记" }));
    expect(push).toHaveBeenCalledExactlyOnceWith("/notes/new");
  });

  it.each(["亮色", "暗色", "跟随系统"])("命令面板可切换主题 %s", async (label) => {
    render(<AppShell>内容</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "打开命令面板" }));
    fireEvent.click(await screen.findByRole("option", { name: `主题：${label}` }));
    expect(setTheme).toHaveBeenCalledWith(
      { 亮色: "light", 暗色: "dark", 跟随系统: "system" }[label],
    );
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it("主题菜单显示三种选项，用户菜单提供设置和登出", async () => {
    render(<AppShell>内容</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "切换主题" }));
    expect(await screen.findByRole("menuitemradio", { name: "跟随系统" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "暗色" }));
    expect(setTheme).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByRole("button", { name: "用户菜单" }));
    expect(await screen.findByRole("menuitem", { name: "个人设置" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    // M10.1：桌面头部的手机版入口，指向当前页在移动端的对应地址并记住偏好
    expect(screen.getByRole("menuitem", { name: "手机版" })).toHaveAttribute(
      "href",
      "/m/notes/new?mobile=1",
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "退出登录" }));
    expect(mutate).toHaveBeenCalledOnce();
  });

  it("所有工作区页面受会话保护，失败可重试", async () => {
    profile.isError = true;
    profile.error = new ApiError(401, "A0311", "会话失效");
    render(
      <AppShell>
        <h1>私有页面</h1>
      </AppShell>,
    );
    expect(screen.queryByRole("heading", { name: "私有页面" })).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("挂载时恢复侧栏，卸载时清空命令面板", async () => {
    localStorage.setItem(
      "anynote-ui",
      JSON.stringify({ state: { sidebarOpen: false }, version: 0 }),
    );
    const { unmount } = render(<AppShell>内容</AppShell>);
    expect(useUIStore.getState().sidebarOpen).toBe(false);
    act(() => useUIStore.getState().setCommandPaletteOpen(true));
    unmount();
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });
});
