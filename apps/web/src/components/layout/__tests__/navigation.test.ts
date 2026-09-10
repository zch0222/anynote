import { describe, expect, it } from "vitest";
import { getWorkspaceRoute, isRouteActive, workspaceRoutes } from "../navigation";

describe("工作区导航", () => {
  it("十个入口均唯一并可识别", () => {
    expect(new Set(workspaceRoutes.map((route) => route.href)).size).toBe(10);
    for (const route of workspaceRoutes) expect(getWorkspaceRoute(route.href)).toEqual(route);
  });
  it("子路由匹配父导航但不误匹配同前缀", () => {
    expect(isRouteActive("/notes/new", "/notes")).toBe(true);
    expect(isRouteActive("/notes-other", "/notes")).toBe(false);
    expect(isRouteActive("/settings/account/security", "/settings/profile")).toBe(true);
    expect(isRouteActive("/ai/pdf", "/ai/chat")).toBe(false);
    expect(getWorkspaceRoute("/notes/new")?.title).toBe("创建笔记");
    expect(getWorkspaceRoute("/missing")).toBeUndefined();
  });
});
