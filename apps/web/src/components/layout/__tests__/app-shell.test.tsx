import { ApiError } from "@/lib/api/errors";
import { useUIStore } from "@/stores/ui-store";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../app-shell";

const { push, replace, setTheme, refetch, bases, profile } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  setTheme: vi.fn(),
  refetch: vi.fn(),
  bases: {
    data: [
      { id: 1, knowledgeBaseName: "产品设计知识库" },
      { id: 2, knowledgeBaseName: "算法与工程实践" },
    ],
    isPending: false,
    isError: false,
    isFetching: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  profile: {
    data: { nickname: "陈可", username: "chenke", avatar: null },
    isPending: false,
    isError: false,
    error: null as Error | null,
  },
}));

const pathname = vi.hoisted(() => ({ current: "/notes" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push, replace }),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "system", setTheme }) }));
vi.mock("@/features/auth/use-me", () => ({ useMe: () => ({ ...profile, refetch }) }));
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: () => bases,
  useKnowledgeBaseQuery: () => ({ data: { knowledgeBaseName: "产品设计知识库", type: 0 } }),
}));
// 侧栏在知识库内会拉三份计数，这些查询在本文件里不是被测对象
vi.mock("@/features/notes/use-notes", () => ({
  useNotesQuery: () => ({
    data: {
      rows: [
        { id: 11, title: "交互一致性检查清单", updateTime: "2026-09-14T10:00:00+08:00" },
        { id: 12, title: "空状态与错误态文案", updateTime: "2026-09-13T10:00:00+08:00" },
      ],
      total: 2,
    },
    isPending: false,
  }),
}));
vi.mock("@/features/mooc/use-moocs", () => ({
  useMoocsQuery: () => ({ data: { rows: [], total: 6 }, isPending: false }),
}));
vi.mock("@/features/tasks/use-tasks", () => ({
  useTasksQuery: () => ({ data: { rows: [], total: 3 }, isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  pathname.current = "/notes";
  profile.isError = false;
  profile.isPending = false;
  profile.error = null;
  bases.data = [
    { id: 1, knowledgeBaseName: "产品设计知识库" },
    { id: 2, knowledgeBaseName: "算法与工程实践" },
  ];
  bases.isPending = false;
  bases.isError = false;
  bases.isFetching = false;
  bases.error = null;
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
  /**
   * 满幅页面（笔记编辑器）不能有内容区留白。
   *
   * 设计稿里这一页的顶栏分隔线与正文底色一直铺到侧栏右侧与窗口右缘；
   * 外面套一层 `px-5 pb-5 sm:px-8`，正文就缩成"灰底上浮着的一张卡片"，
   * 与「编辑器占满剩余所有空间」正好相反——而这一层内边距在 AppShell 里，
   * 不在编辑器组件里，改编辑器时很容易漏掉。
   */
  it("笔记编辑器路由的内容区不留内边距，且是确定高度的 flex 列", () => {
    for (const route of ["/notes/7/42", "/notes/1/2"]) {
      pathname.current = route;
      const { unmount } = render(
        <AppShell>
          <h1>编辑器</h1>
        </AppShell>,
      );
      const content = document.getElementById("workspace-content");
      expect(content, `${route} 缺少内容区`).not.toBeNull();
      expect(content?.className, `${route} 内容区不该有内边距`).not.toMatch(/\bpx-|\bpb-|\bpy-/);
      // 满幅页面自己 flex-1 吃满剩余高度，需要确定高度链才滚得起来
      expect(content?.className).toContain("flex-1");
      expect(content?.className).toContain("min-h-0");
      expect(content?.className).toContain("flex-col");
      unmount();
    }
  });

  it("其它页面仍保留内容区留白", () => {
    pathname.current = "/notes";
    render(
      <AppShell>
        <h1>知识库</h1>
      </AppShell>,
    );
    const content = document.getElementById("workspace-content");
    expect(content?.className).toMatch(/\bpx-5\b/);
    expect(content?.className).toMatch(/\bpb-5\b/);
    expect(content?.className).toContain("sm:px-8");
  });

  it("满幅页面把内容列底色换成卡片白，避免灰底从缝隙里透出来", () => {
    pathname.current = "/notes/7/42";
    const { unmount } = render(
      <AppShell>
        <h1>编辑器</h1>
      </AppShell>,
    );
    // 侧栏右侧那一列是编辑器的白底；非满幅页面用灰底衬托卡片。
    // 只看内容区所属的那一层——`.bg-fill-hover` 在顶栏/侧栏里也出现，全局查会误判。
    const inset = document.getElementById("workspace-content")?.parentElement;
    expect(inset?.className).toContain("bg-surface");
    expect(inset?.className).not.toContain("bg-fill-hover");
    unmount();
  });

  it("侧栏把知识库铺成一级入口，而不是四个平铺的静态页", async () => {
    render(
      <AppShell>
        <h1>页面内容</h1>
      </AppShell>,
    );
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    // 动态的知识库列表来自 query 缓存
    expect(within(navigation).getByRole("link", { name: /产品设计知识库/ })).toHaveAttribute(
      "href",
      "/notes/1",
    );
    expect(within(navigation).getByRole("link", { name: /算法与工程实践/ })).toHaveAttribute(
      "href",
      "/notes/2",
    );
    // 跨库能力单独成组，不再是"笔记/文档/知识库"三连
    expect(within(navigation).getByRole("link", { name: "AI 对话" })).toHaveAttribute(
      "href",
      "/ai/chat",
    );
    // 「协同文档」随 /docs 退役从一级导航移除：协同已是笔记的一种编辑模式，入口就是笔记本身
    expect(within(navigation).queryByRole("link", { name: "协同文档" })).toBeNull();
    // 四类子资源降为知识库内的二级 Tab，不出现在一级导航
    expect(within(navigation).queryByRole("link", { name: "慕课" })).toBeNull();
    expect(within(navigation).queryByRole("link", { name: "任务" })).toBeNull();
  });

  it("进了知识库之后侧栏换成当前库卡片与二级导航，并给出计数", () => {
    pathname.current = "/notes/7/tasks";
    render(<AppShell>内容</AppShell>);

    // 头部换成"我在哪个库"
    expect(screen.getByTestId("sidebar-kb-card")).toHaveAttribute("href", "/notes");
    expect(screen.getByTestId("sidebar-kb-card")).toHaveTextContent("产品设计知识库");

    // 二级导航在侧栏，不在顶栏
    const tabs = screen.getByRole("navigation", { name: "知识库内容" });
    expect(within(tabs).getByRole("link", { name: /概览/ })).toHaveAttribute(
      "href",
      "/notes/7/overview",
    );
    expect(within(tabs).getByRole("link", { name: /笔记/ })).toHaveAttribute("href", "/notes/7");
    expect(within(tabs).getByRole("link", { name: /成员/ })).toHaveAttribute(
      "href",
      "/notes/7/members",
    );
    // 计数来自各自的列表查询
    expect(within(tabs).getByRole("link", { name: /笔记/ })).toHaveTextContent("2");
    expect(within(tabs).getByRole("link", { name: /慕课/ })).toHaveTextContent("6");
    expect(within(tabs).getByRole("link", { name: /任务/ })).toHaveTextContent("3");

    expect(within(tabs).getByRole("link", { name: /任务/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("知识库内不再列出别的知识库——换库收进卡片与画廊", () => {
    pathname.current = "/notes/7";
    render(<AppShell>内容</AppShell>);
    // 「我有哪些库」那一列在进库后让位给「这个库里有什么」
    expect(screen.queryByTestId("sidebar-base-1")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "主导航" })).toBeNull();
  });

  it("编辑器里「笔记」仍然高亮，且目录高亮当前那篇", () => {
    pathname.current = "/notes/7/11";
    render(<AppShell>内容</AppShell>);

    const tabs = screen.getByRole("navigation", { name: "知识库内容" });
    expect(within(tabs).getByRole("link", { name: /笔记/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const directory = screen.getByRole("navigation", { name: "笔记列表" });
    expect(within(directory).getByRole("link", { name: /交互一致性检查清单/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(directory).getByRole("link", { name: /空状态与错误态文案/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("非「笔记」面收起笔记目录，不挤掉要看的内容", () => {
    pathname.current = "/notes/7/members";
    render(<AppShell>内容</AppShell>);
    expect(screen.getByTestId("sidebar-note-directory")).toHaveClass("hidden");
  });

  it("知识库外页的顶栏退回面包屑，且侧栏是知识库列表", () => {
    pathname.current = "/ai/chat";
    render(<AppShell>内容</AppShell>);
    const crumb = screen.getByRole("navigation", { name: "面包屑" });
    expect(within(crumb).getByText("AI 对话")).toBeInTheDocument();
    expect(screen.queryByTestId("kb-switcher")).toBeNull();
    // 库外仍然是"我有哪些库"
    expect(screen.getByTestId("sidebar-base-1")).toBeInTheDocument();
  });

  /**
   * 知识库内 Tab 页的分工是"页面自己当页头"（D-01 / D-05 / D-07 / D-08 / D-09，
   * 以及 D-02 概览）。
   *
   * 画板上这些页屏幕顶部都没有 56 高的栏，搜索（图例 7）与主题（图例 8）落在
   * 页头右侧的动作行里。顶栏若照常渲染，除了多一条画板没有的横栏，同一屏还会有
   * 两套同名按钮：读屏念两遍，`getByRole("button", { name: "切换主题" })`
   * 直接变成 strict mode violation。所以这里断言的是"一个都没有"而不是"存在"。
   */
  it("知识库内 Tab 页不渲染顶栏，控件不会在同一屏出现两套", () => {
    pathname.current = "/notes/7/overview";
    render(<AppShell>内容</AppShell>);

    expect(screen.queryByTestId("app-header")).toBeNull();
    expect(screen.queryByTestId("kb-switcher")).toBeNull();
    // 顶栏走掉后，进度条也没有要对齐的东西
    expect(screen.queryByTestId("route-progress")).toBeNull();

    // 侧栏不受影响：库卡片与二级导航照常在
    expect(screen.getByTestId("sidebar-kb-card")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "知识库内容" })).toBeInTheDocument();
  });

  it("库内其余 Tab 也一并不渲染顶栏", () => {
    for (const path of [
      "/notes/7",
      "/notes/7/mooc",
      "/notes/7/tasks",
      "/notes/7/docs",
      "/notes/7/members",
    ]) {
      cleanup();
      pathname.current = path;
      render(<AppShell>内容</AppShell>);
      expect(screen.queryByTestId("app-header"), `${path} 不该有顶栏`).toBeNull();
    }
  });

  it("库外页面与库内详情页仍然保留顶栏", () => {
    for (const path of ["/ai/chat", "/settings/profile", "/notes/new"]) {
      cleanup();
      pathname.current = path;
      render(<AppShell>内容</AppShell>);
      expect(screen.getByTestId("app-header"), `${path} 应保留顶栏`).toBeInTheDocument();
    }
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

  it("侧栏搜索框派发与 ⌘K 等价的快捷键事件", async () => {
    render(<AppShell>内容</AppShell>);
    fireEvent.click(screen.getByTestId("sidebar-search"));
    expect(await screen.findByRole("combobox", { name: "搜索页面或操作" })).toBeVisible();
  });

  it("Cmd+K 可切换开关，空搜索显示提示，新建动作进入创建页", async () => {
    render(<AppShell>内容</AppShell>);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await screen.findByRole("combobox");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "打开命令面板" }));
    const input = await screen.findByRole("combobox");
    fireEvent.change(input, { target: { value: "不存在xyz" } });
    expect(await screen.findByText("没有找到匹配的操作")).toBeVisible();
    // 「创建笔记」同时在快捷操作与「跳转到」两组里，取第一组那条即可
    fireEvent.change(input, { target: { value: "创建笔记" } });
    const [firstNewNote] = await screen.findAllByRole("option", { name: "创建笔记" });
    fireEvent.click(firstNewNote as HTMLElement);
    expect(push).toHaveBeenCalledExactlyOnceWith("/notes/new");
  });

  it.each(["浅色", "深色", "跟随系统"])("命令面板可切换主题 %s", async (label) => {
    render(<AppShell>内容</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "打开命令面板" }));
    fireEvent.click(await screen.findByRole("option", { name: `主题：${label}` }));
    expect(setTheme).toHaveBeenCalledWith(
      { 浅色: "light", 深色: "dark", 跟随系统: "system" }[label],
    );
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it("主题菜单显示三种选项，侧栏用户卡通向个人设置", async () => {
    render(<AppShell>内容</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "切换主题" }));
    expect(await screen.findByRole("menuitemradio", { name: "跟随系统" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "深色" }));
    expect(setTheme).toHaveBeenCalledWith("dark");

    // 设置入口收在侧栏页脚的用户卡里，不再占一级导航
    const userCard = screen.getByTestId("sidebar-user");
    expect(userCard).toHaveAttribute("href", "/settings/profile");
    expect(within(userCard).getByText("陈可")).toBeInTheDocument();
  });

  /**
   * D-12 图例 1：设置不进一级导航，**入口就是这张用户卡**——
   * 所以进到设置里时它必须显示选中态，否则侧栏上看不出"我在设置里"。
   */
  it("用户卡在 /settings/* 下显示选中态，离开后取消", () => {
    pathname.current = "/settings/profile";
    const { unmount } = render(<AppShell>内容</AppShell>);

    const userCard = screen.getByTestId("sidebar-user");
    expect(userCard).toHaveAttribute("data-active", "true");
    expect(userCard).toHaveAttribute("aria-current", "page");
    expect(userCard.className).toContain("bg-accent-soft");
    unmount();

    pathname.current = "/notes";
    render(<AppShell>内容</AppShell>);
    const idle = screen.getByTestId("sidebar-user");
    expect(idle).toHaveAttribute("data-active", "false");
    expect(idle.className).not.toContain("bg-accent-soft");
  });

  it("前缀相同但不是设置页的地址不高亮用户卡", () => {
    // `/settingsomething` 不是设置页；用 startsWith("/settings") 会把它算进来
    pathname.current = "/settingsomething";
    render(<AppShell>内容</AppShell>);
    expect(screen.getByTestId("sidebar-user")).toHaveAttribute("data-active", "false");
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
    profile.isError = false;
    profile.error = null;
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

  it("侧栏没有知识库时给出空态与唯一入口", () => {
    bases.data = [];
    render(<AppShell>内容</AppShell>);
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    expect(within(navigation).getByText("还没有知识库")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-new-base")).toHaveAttribute("href", "/notes?new=1");
  });

  it("侧栏知识库出错时给 compact 错误态，点重试重新请求", () => {
    bases.isError = true;
    bases.error = new Error("网络异常");
    render(<AppShell>内容</AppShell>);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("知识库加载失败：网络异常");
    // 12.0.3 的 compact 形态：不带图标，窄栏里才塞得下
    expect(alert.querySelector("svg")).toBeNull();
    expect(alert.className).toContain("px-2.5");

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(bases.refetch).toHaveBeenCalledTimes(1);
  });
});
