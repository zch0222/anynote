import {
  mobileMoreRoutes,
  mobileTabs,
  newNoteRoute,
  toMobileHref,
  workspaceRoutes,
} from "@/components/layout/navigation";

export type MobileSearchItem = {
  /** 目标地址，始终是 `/m/*`。 */
  href: string;
  title: string;
  /** 参与匹配的附加关键词（路径、别名）。 */
  keywords: string;
};

/**
 * 移动端搜索页的候选集（M10.2 / 方案 D6）。
 *
 * 桌面的 ⌘K 用 `cmdk` 做模糊匹配，移动端**不引入它**——为一页搜索背一个库
 * 顶不住 250KB 的首屏预算。候选集同样从导航注册表派生，不写第二份真相：
 * 桌面路由里没有移动端对应页的（如 `/ai/workflow`）由 `toMobileHref` 过滤掉。
 *
 * 这里搜的是**页面与入口**，与桌面命令面板同口径；
 * 笔记正文搜索需要后端检索端点，两端都还没有。
 */
export function buildMobileSearchItems(): MobileSearchItem[] {
  const items: MobileSearchItem[] = [];
  const seen = new Set<string>();

  const push = (title: string, href: string | null, keywords: string) => {
    if (!href || seen.has(href)) return;
    seen.add(href);
    items.push({ href, title, keywords });
  };

  push("创建笔记", toMobileHref(newNoteRoute.href), `${newNoteRoute.href} new note 新建`);
  for (const tab of mobileTabs) push(tab.title, tab.href, tab.href);
  for (const route of workspaceRoutes) push(route.title, toMobileHref(route.href), route.href);
  for (const route of mobileMoreRoutes) push(route.title, route.href, route.href);

  return items;
}

/**
 * 过滤候选：大小写不敏感的子串匹配，标题命中排在关键词命中之前。
 *
 * 不做模糊 / 拼音匹配——那正是引入 `cmdk` 的理由，而候选集只有十几条，
 * 子串匹配已经够用。空查询返回全部，让搜索页一进去就是入口清单。
 */
export function filterMobileSearchItems(
  items: MobileSearchItem[],
  query: string,
): MobileSearchItem[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return items;

  const byTitle: MobileSearchItem[] = [];
  const byKeyword: MobileSearchItem[] = [];
  for (const item of items) {
    if (item.title.toLowerCase().includes(keyword)) byTitle.push(item);
    else if (item.keywords.toLowerCase().includes(keyword)) byKeyword.push(item);
  }
  return [...byTitle, ...byKeyword];
}
