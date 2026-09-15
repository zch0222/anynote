import {
  MOBILE_SEARCH_GROUP_LABELS,
  buildMobileBaseItems,
  buildMobileSearchItems,
  canCreateNoteFromQuery,
  createNoteFromQueryHref,
  filterMobileSearchItems,
  isMobileSearchEmpty,
} from "@/lib/mobile/search";
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
    expect(hrefs).toContain("/m/ai/pdf");
  });

  it("页面组不含任务与慕课（2026-09-15 拍板：只属于知识库）", () => {
    const titles = items.map((item) => item.title);
    expect(titles).not.toContain("任务");
    expect(titles).not.toContain("慕课");
    expect(items.some((item) => item.href === "/m/tasks")).toBe(false);
    expect(items.some((item) => item.href === "/m/mooc")).toBe(false);
  });

  it("移动端没有对应页的路由不进候选（画布）", () => {
    expect(items.some((item) => item.href.includes("workflow"))).toBe(false);
  });

  it("AI 入口带「入口保留」副标题", () => {
    const aiChat = items.find((item) => item.href === "/m/ai/chat");
    expect(aiChat?.hint).toBe("入口保留");
    expect(aiChat?.group).toBe("page");
  });

  it("创建笔记归在「快捷操作」组", () => {
    const create = items.find((item) => item.href === "/m/notes/new");
    expect(create?.group).toBe("action");
  });
});

describe("buildMobileBaseItems", () => {
  it("知识库候选走 /m/notes/:id，归在「知识库」组", () => {
    const rows = buildMobileBaseItems([
      { id: 3, knowledgeBaseName: "产品设计", detail: "设计资料" },
      { id: 5, knowledgeBaseName: null },
    ]);
    expect(rows[0]?.href).toBe("/m/notes/3");
    expect(rows[0]?.group).toBe("base");
    // 没有名字的库给兜底名，不是空白行
    expect(rows[1]?.title).toBe("未命名知识库");
  });
});

describe("filterMobileSearchItems", () => {
  const items = [
    ...buildMobileBaseItems([{ id: 3, knowledgeBaseName: "产品设计" }]),
    { href: "/m/notes", title: "笔记", keywords: "/notes", group: "page" as const },
    { href: "/m/ai/chat", title: "AI 对话", keywords: "/ai/chat todo", group: "page" as const },
  ];

  it("空查询返回全部分组，让搜索页一进去就是入口清单", () => {
    const groups = filterMobileSearchItems(items, "");
    expect(groups.page).toHaveLength(2);
    expect(groups.base).toHaveLength(1);
    expect(isMobileSearchEmpty(groups)).toBe(false);
  });

  it("按标题子串匹配并保持分组", () => {
    const groups = filterMobileSearchItems(items, "产品");
    expect(groups.base.map((item) => item.href)).toEqual(["/m/notes/3"]);
    expect(groups.page).toHaveLength(0);
  });

  it("按关键词匹配，大小写不敏感", () => {
    const groups = filterMobileSearchItems(items, "TODO");
    expect(groups.page.map((item) => item.href)).toEqual(["/m/ai/chat"]);
  });

  it("没有命中时三组都空", () => {
    expect(isMobileSearchEmpty(filterMobileSearchItems(items, "不存在xyz"))).toBe(true);
  });

  it("分组标题齐全", () => {
    expect(MOBILE_SEARCH_GROUP_LABELS.action).toBe("快捷操作");
    expect(MOBILE_SEARCH_GROUP_LABELS.base).toBe("知识库");
    expect(MOBILE_SEARCH_GROUP_LABELS.page).toBe("页面");
  });
});

describe("canCreateNoteFromQuery / createNoteFromQueryHref", () => {
  it("只在 3–15 字时给出「用「q」新建笔记」", () => {
    expect(canCreateNoteFromQuery("ab")).toBe(false);
    expect(canCreateNoteFromQuery("abc")).toBe(true);
    expect(canCreateNoteFromQuery("a".repeat(15))).toBe(true);
    expect(canCreateNoteFromQuery("a".repeat(16))).toBe(false);
  });

  it("首尾空白不计入长度", () => {
    expect(canCreateNoteFromQuery("  ab  ")).toBe(false);
    expect(canCreateNoteFromQuery("  abc  ")).toBe(true);
  });

  it("预填地址带 title 且已编码", () => {
    expect(createNoteFromQueryHref("周报模板")).toBe(
      `/m/notes/new?title=${encodeURIComponent("周报模板")}`,
    );
    expect(createNoteFromQueryHref("a b")).toBe("/m/notes/new?title=a%20b");
  });
});
