import { buildMobileSearchItems, filterMobileSearchItems } from "@/lib/mobile/search";
import { describe, expect, it } from "vitest";

describe("buildMobileSearchItems", () => {
  const items = buildMobileSearchItems();

  it("候选全部是移动端地址", () => {
    expect(items.length).toBeGreaterThan(5);
    for (const item of items) expect(item.href.startsWith("/m/")).toBe(true);
  });

  it("地址不重复——tab 与桌面注册表会指向同一批页面", () => {
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
  });

  it("包含创建笔记与主要入口", () => {
    const hrefs = items.map((item) => item.href);
    expect(hrefs).toContain("/m/notes/new");
    expect(hrefs).toContain("/m/notes");
    expect(hrefs).toContain("/m/tasks");
    expect(hrefs).toContain("/m/ai/pdf");
  });

  it("移动端没有对应页的路由不进候选（决策 4 的画布）", () => {
    expect(items.some((item) => item.href.includes("workflow"))).toBe(false);
  });
});

describe("filterMobileSearchItems", () => {
  const items = [
    { href: "/m/notes", title: "笔记", keywords: "/notes" },
    { href: "/m/tasks", title: "任务", keywords: "/tasks todo" },
    { href: "/m/ai/chat", title: "AI 对话", keywords: "/ai/chat" },
  ];

  it("空查询返回全部，让搜索页一进去就是入口清单", () => {
    expect(filterMobileSearchItems(items, "")).toHaveLength(3);
    expect(filterMobileSearchItems(items, "   ")).toHaveLength(3);
  });

  it("按标题子串匹配", () => {
    expect(filterMobileSearchItems(items, "任务").map((item) => item.href)).toEqual(["/m/tasks"]);
  });

  it("按关键词匹配，大小写不敏感", () => {
    expect(filterMobileSearchItems(items, "TODO").map((item) => item.href)).toEqual(["/m/tasks"]);
  });

  it("标题命中排在关键词命中之前", () => {
    const rows = [
      { href: "/m/a", title: "别的页面", keywords: "笔记相关" },
      { href: "/m/b", title: "笔记", keywords: "" },
    ];
    expect(filterMobileSearchItems(rows, "笔记").map((item) => item.href)).toEqual([
      "/m/b",
      "/m/a",
    ]);
  });

  it("没有命中时返回空数组", () => {
    expect(filterMobileSearchItems(items, "不存在xyz")).toEqual([]);
  });
});
