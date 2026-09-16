import { describe, expect, it } from "vitest";
import {
  activeMobileTab,
  getWorkspaceRoute,
  isFullBleedRoute,
  isImmersiveMobileRoute,
  isKnowledgeBaseOverviewRoute,
  isMobilePath,
  isRouteActive,
  knowledgeBaseRoute,
  mobileMoocDetailHref,
  mobileMoreRoutes,
  mobileNoteHistoryHref,
  mobileTabs,
  mobileTaskDetailHref,
  mobileUnavailableRoutes,
  moocDetailHref,
  noteHistoryHref,
  taskDetailHref,
  taskEditHref,
  taskNewHref,
  toDesktopHref,
  toMobileHref,
  toolGroups,
  workspaceRoutes,
} from "../navigation";

describe("工作区导航", () => {
  it("一级导航只剩知识库 + 跨库能力 + 创建笔记 + 设置，地址唯一", () => {
    // 重设计后「工作台 / 笔记 / 文档 / 知识库 / 课程 / 任务」不再平铺成同级入口
    expect(workspaceRoutes.map((route) => route.href)).toEqual([
      "/notes",
      "/ai/chat",
      "/ai/workflow",
      "/ai/pdf",
      "/docs",
      "/notes/new",
      "/settings/profile",
    ]);
    expect(new Set(workspaceRoutes.map((route) => route.href)).size).toBe(workspaceRoutes.length);
    for (const route of workspaceRoutes) expect(getWorkspaceRoute(route.href)).toEqual(route);
  });

  it("知识库是唯一的一级动态入口，AI 与协作各自成组", () => {
    expect(knowledgeBaseRoute.href).toBe("/notes");
    expect(toolGroups.map((group) => group.label)).toEqual(["AI 助手", "协作"]);
    // 四类子资源降为知识库内的二级 Tab，不再是顶层入口
    for (const href of ["/wikis", "/mooc", "/tasks"]) {
      expect(workspaceRoutes.some((route) => route.href === href)).toBe(false);
    }
  });

  it("子路由匹配父导航但不误匹配同前缀", () => {
    expect(isRouteActive("/notes/new", "/notes")).toBe(true);
    expect(isRouteActive("/notes-other", "/notes")).toBe(false);
    expect(isRouteActive("/notes/12/tasks", "/notes")).toBe(true);
    expect(isRouteActive("/settings/account/security", "/settings/profile")).toBe(true);
    expect(isRouteActive("/ai/pdf", "/ai/chat")).toBe(false);
    expect(getWorkspaceRoute("/notes/new")?.title).toBe("创建笔记");
    expect(getWorkspaceRoute("/missing")).toBeUndefined();
  });
});

describe("满幅路由", () => {
  /**
   * 满幅＝内容区不加内边距，由页面自己吃到视口边缘。
   *
   * 只有笔记编辑器：设计稿里它的顶栏分隔线与正文底色一直延伸到侧栏右侧与窗口右缘，
   * 外面再套一层留白，正文就变成"灰底上浮着的一张卡片"，与"编辑器占满剩余所有空间"相反。
   */
  it("笔记编辑器与笔记历史版本（两段数字，可带 history）满幅", () => {
    expect(isFullBleedRoute("/notes/7/42")).toBe(true);
    expect(isFullBleedRoute("/notes/1/1")).toBe(true);
    // D-16：历史版本左右两栏各自满幅，同样不能有外层留白
    expect(isFullBleedRoute("/notes/3/7/history")).toBe(true);
  });

  it("知识库内的其它详情页仍然走文档流", () => {
    // 任务详情 / 任务表单 / 慕课详情都要留白，不能因为「多一层 id」被误判满幅
    expect(isFullBleedRoute("/notes/3/tasks/9")).toBe(false);
    expect(isFullBleedRoute("/notes/3/tasks/new")).toBe(false);
    expect(isFullBleedRoute("/notes/3/mooc/12")).toBe(false);
  });

  it("二级页与列表页仍走文档流（要有留白）", () => {
    expect(isFullBleedRoute("/notes/7")).toBe(false);
    expect(isFullBleedRoute("/notes")).toBe(false);
    expect(isFullBleedRoute("/notes/new")).toBe(false);
    expect(isFullBleedRoute("/notes/7/overview")).toBe(false);
    expect(isFullBleedRoute("/notes/7/members")).toBe(false);
    expect(isFullBleedRoute("/notes/7/tasks")).toBe(false);
  });

  it("按整段数字判定，不接受非数字或尾随段", () => {
    // 字面量 "notes" 曾经被 `[baseId]/[noteId]` 当 id 吃掉然后 notFound()，
    // 判定口径必须与路由一致：只有纯数字才算命中
    expect(isFullBleedRoute("/notes/abc/def")).toBe(false);
    expect(isFullBleedRoute("/notes/7/42/extra")).toBe(false);
    expect(isFullBleedRoute("/notes/7/42/")).toBe(false);
    expect(isFullBleedRoute("/ai/chat")).toBe(false);
    expect(isFullBleedRoute("/")).toBe(false);
  });
});

/**
 * 概览页的顶栏抑制（D-02 图例 7 / 8 / 9）。
 *
 * 画板上搜索、主题与「新建笔记」都在头图卡片的动作行里，屏幕顶部没有 56 高的栏。
 * 顶栏若照常渲染，同一屏会出现两套「切换主题」/「打开命令面板」——
 * 读屏会念两遍，`getByRole` 也会变成 strict mode violation。
 */
describe("知识库概览页（D-02）不渲染顶栏", () => {
  it("只有 /notes/{id}/overview 命中", () => {
    expect(isKnowledgeBaseOverviewRoute("/notes/7/overview")).toBe(true);
    expect(isKnowledgeBaseOverviewRoute("/notes/128/overview")).toBe(true);
  });

  it("同级的其它 Tab 与更深的路径都不命中", () => {
    // 这几个页面画板上仍有各自的页头，顶栏要保留
    expect(isKnowledgeBaseOverviewRoute("/notes/7")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/notes/7/docs")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/notes/7/members")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/notes/7/tasks")).toBe(false);
    // 编辑器 / 历史版本按满幅处理，与顶栏抑制是两件事
    expect(isKnowledgeBaseOverviewRoute("/notes/7/42")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/notes/7/42/history")).toBe(false);
  });

  it("按完整段匹配，不接受尾随段、前缀或非数字 id", () => {
    expect(isKnowledgeBaseOverviewRoute("/notes/7/overview/extra")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/notes/7/overviewX")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/notes/abc/overview")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/notes/overview")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/notes/7/overview/")).toBe(false);
    expect(isKnowledgeBaseOverviewRoute("/ai/chat")).toBe(false);
  });
});

describe("移动端导航映射", () => {
  it("4 个 tab，地址唯一且都在 /m 下", () => {
    expect(mobileTabs).toHaveLength(4);
    expect(new Set(mobileTabs.map((tab) => tab.href)).size).toBe(4);
    for (const tab of mobileTabs) expect(tab.href.startsWith("/m/")).toBe(true);
    expect(mobileTabs.map((tab) => tab.title)).toEqual(["工作台", "知识库", "AI", "我的"]);
  });

  it("每个 tab 的 href 都能点亮自己", () => {
    for (const tab of mobileTabs) {
      expect(activeMobileTab(tab.href)?.title).toBe(tab.title);
    }
  });

  it("子路由点亮所属 tab", () => {
    expect(activeMobileTab("/m/notes/3/7")?.title).toBe("知识库");
    // 知识库内二级 Tab / 详情页都归到「知识库」，不额外占一格
    expect(activeMobileTab("/m/notes/3/tasks")?.title).toBe("知识库");
    expect(activeMobileTab("/m/notes/3/tasks/9")?.title).toBe("知识库");
    expect(activeMobileTab("/m/notes/3/7/history")?.title).toBe("知识库");
    expect(activeMobileTab("/m/ai/pdf")?.title).toBe("AI");
    expect(activeMobileTab("/m/settings/appearance")?.title).toBe("我的");
  });

  it("不在 tab 里的页面不点亮任何一格", () => {
    // 待办与协同文档降级为「我的」里的更多入口，没有自己的 tab
    expect(activeMobileTab("/m/tasks")).toBeUndefined();
    expect(activeMobileTab("/m/mooc/12")).toBeUndefined();
    expect(activeMobileTab("/m/docs")).toBeUndefined();
  });

  it("桌面路由映射到移动端，带参数原样保留", () => {
    expect(toMobileHref("/dashboard")).toBe("/m/dashboard");
    expect(toMobileHref("/notes/3/7")).toBe("/m/notes/3/7");
    expect(toMobileHref("/notes/3/tasks")).toBe("/m/notes/3/tasks");
    expect(toMobileHref("/settings/profile")).toBe("/m/settings/profile");
    expect(toMobileHref("/notes/3?page=2")).toBe("/m/notes/3?page=2");
    expect(toMobileHref("/")).toBe("/m/dashboard");
  });

  it("没有移动端对应页的路由返回 null", () => {
    expect(toMobileHref("/ai/workflow")).toBeNull();
    expect(toMobileHref("/playground/editor")).toBeNull();
    expect(toMobileHref("/不存在")).toBeNull();
  });

  it("前缀按整段匹配，不会吃掉同前缀的别的路由", () => {
    expect(toMobileHref("/notes-archive")).toBeNull();
    expect(toMobileHref("/ai/chatroom")).toBeNull();
  });

  it("已经是移动端地址时原样返回，不重复加前缀", () => {
    expect(toMobileHref("/m/notes")).toBe("/m/notes");
  });

  it("移动端路由映射回桌面", () => {
    expect(toDesktopHref("/m/notes/3/7")).toBe("/notes/3/7");
    expect(toDesktopHref("/m/ai/chat/9?x=1")).toBe("/ai/chat/9?x=1");
    // 移动端独有的页面回退到最接近的桌面页
    expect(toDesktopHref("/m/me")).toBe("/settings/profile");
    expect(toDesktopHref("/m")).toBe("/dashboard");
  });

  it("非移动端地址原样返回", () => {
    expect(toDesktopHref("/notes")).toBe("/notes");
    expect(toDesktopHref("/mooc/1")).toBe("/mooc/1");
  });

  it("isMobilePath 按路径段判断，/mooc 不算移动端", () => {
    expect(isMobilePath("/m")).toBe(true);
    expect(isMobilePath("/m/notes")).toBe(true);
    expect(isMobilePath("/mooc")).toBe(false);
    expect(isMobilePath("/me")).toBe(false);
  });

  it("沉浸式路由只覆盖详情页，列表页仍显示 tab bar", () => {
    expect(isImmersiveMobileRoute("/m/notes/3/7")).toBe(true);
    expect(isImmersiveMobileRoute("/m/notes/3/7/history")).toBe(true);
    expect(isImmersiveMobileRoute("/m/docs/abc")).toBe(true);
    expect(isImmersiveMobileRoute("/m/ai/chat/9")).toBe(true);
    expect(isImmersiveMobileRoute("/m/search")).toBe(true);

    expect(isImmersiveMobileRoute("/m/notes")).toBe(false);
    expect(isImmersiveMobileRoute("/m/notes/3")).toBe(false);
    // 新建笔记是两段，不能被 [baseId]/[noteId] 的模式误判成编辑器
    expect(isImmersiveMobileRoute("/m/notes/new")).toBe(false);
    expect(isImmersiveMobileRoute("/m/ai/chat")).toBe(false);
  });

  it("知识库内 Tab 与详情不隐藏 tab bar（按数字段判定，§1.4 第 7 条）", () => {
    // 回归：旧模式 /^\/m\/notes\/[^/]+\/[^/]+$/ 会把 /m/notes/3/tasks 当成编辑器，
    // 底部 tab bar 被误隐藏，与画板 M-03 – M-05 不符
    expect(isImmersiveMobileRoute("/m/notes/3/tasks")).toBe(false);
    expect(isImmersiveMobileRoute("/m/notes/3/mooc")).toBe(false);
    expect(isImmersiveMobileRoute("/m/notes/3/docs")).toBe(false);
    expect(isImmersiveMobileRoute("/m/notes/3/mooc/12")).toBe(false);
    expect(isImmersiveMobileRoute("/m/notes/3/tasks/9")).toBe(false);
  });

  it("更多入口不再列出任务与慕课", () => {
    const hrefs = mobileMoreRoutes.map((route) => route.href);
    expect(hrefs).not.toContain("/m/tasks");
    expect(hrefs).not.toContain("/m/mooc");
    expect(hrefs).toEqual(["/m/docs", "/m/ai/pdf"]);
  });

  it("更多入口与不可用路由都指向存在的地址", () => {
    for (const route of mobileMoreRoutes) expect(route.href.startsWith("/m/")).toBe(true);
    for (const route of mobileUnavailableRoutes) {
      expect(toMobileHref(route.desktopHref)).toBeNull();
    }
  });
});

describe("知识库内详情页地址函数", () => {
  /**
   * 这些函数是**唯一**的地址来源：页面里再手拼字符串就会在两层 id 上拼错，
   * 而拼错的结果往往是落到别的页面而不是 404，只在真实点击时才暴露。
   */
  it("桌面地址", () => {
    expect(moocDetailHref(3, 12)).toBe("/notes/3/mooc/12");
    expect(taskDetailHref(3, 9)).toBe("/notes/3/tasks/9");
    expect(taskNewHref(3)).toBe("/notes/3/tasks/new");
    expect(taskEditHref(3, 9)).toBe("/notes/3/tasks/9/edit");
    expect(noteHistoryHref(3, 42)).toBe("/notes/3/42/history");
  });

  it("移动端地址", () => {
    expect(mobileMoocDetailHref(3, 12)).toBe("/m/notes/3/mooc/12");
    expect(mobileTaskDetailHref(3, 9)).toBe("/m/notes/3/tasks/9");
    expect(mobileNoteHistoryHref(3, 42)).toBe("/m/notes/3/42/history");
  });

  it("新建任务不会被 [taskId] 抢走（静态段在 docs 侧靠路由优先级，这里保证格式）", () => {
    // 单段 new 与数字 id 形态不同，Next 的静态段优先级因此能正确分流
    expect(taskNewHref(3).endsWith("/new")).toBe(true);
    expect(taskDetailHref(3, 9)).not.toContain("/new");
  });
});
