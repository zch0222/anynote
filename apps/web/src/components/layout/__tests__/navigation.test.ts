import { describe, expect, it } from "vitest";
import {
  activeMobileTab,
  getWorkspaceRoute,
  isImmersiveMobileRoute,
  isMobilePath,
  isRouteActive,
  knowledgeBaseRoute,
  mobileMoreRoutes,
  mobileTabs,
  mobileUnavailableRoutes,
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
    // 只读浏览与可写笔记同源，归到"知识库"而不是再占一格
    expect(activeMobileTab("/m/wikis/3")?.title).toBe("知识库");
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
    expect(isImmersiveMobileRoute("/m/docs/abc")).toBe(true);
    expect(isImmersiveMobileRoute("/m/ai/chat/9")).toBe(true);
    expect(isImmersiveMobileRoute("/m/search")).toBe(true);

    expect(isImmersiveMobileRoute("/m/notes")).toBe(false);
    expect(isImmersiveMobileRoute("/m/notes/3")).toBe(false);
    // 新建笔记是两段，不能被 [baseId]/[noteId] 的模式误判成编辑器
    expect(isImmersiveMobileRoute("/m/notes/new")).toBe(false);
    expect(isImmersiveMobileRoute("/m/ai/chat")).toBe(false);
  });

  it("更多入口与不可用路由都指向存在的地址", () => {
    for (const route of mobileMoreRoutes) expect(route.href.startsWith("/m/")).toBe(true);
    for (const route of mobileUnavailableRoutes) {
      expect(toMobileHref(route.desktopHref)).toBeNull();
    }
  });
});
