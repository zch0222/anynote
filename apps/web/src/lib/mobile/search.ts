import {
  mobileMoreRoutes,
  mobileTabs,
  newNoteRoute,
  toMobileHref,
  workspaceRoutes,
} from "@/components/layout/navigation";

/** 结果分组（M-10 图例 5）：快捷操作 / 知识库 / 页面。 */
export type MobileSearchGroupKey = "action" | "base" | "page";

export type MobileSearchItem = {
  /** 目标地址，始终是 `/m/*`。 */
  href: string;
  title: string;
  /** 参与匹配的附加关键词（路径、别名）。 */
  keywords: string;
  group: MobileSearchGroupKey;
  /** 副标题，如 AI 入口的「入口保留」。 */
  hint?: string | undefined;
};

export const MOBILE_SEARCH_GROUP_LABELS: Record<MobileSearchGroupKey, string> = {
  action: "快捷操作",
  base: "知识库",
  page: "页面",
};

/**
 * 页面组里**不出现**的项（2026-09-15 拍板）。
 *
 * 「任务」「慕课」只属于知识库，从搜索里点进去会落到一个不知道属于哪个库的页面；
 * 它们在本库 Tab 里已经有两个入口了。
 *
 * 这里按**标题**过滤而不是按地址：`workspaceRoutes` 里的 `/tasks`、`/mooc`
 * 现在已经是重定向页，地址本身还会变；按标题挡能同时盖住注册表里将来
 * 万一再出现的同名项。
 */
const PAGE_GROUP_EXCLUDED_TITLES = new Set(["任务", "慕课"]);

/**
 * 带副标题的页面项。AI 相关页面本轮不出稿（§1.2），但入口照常保留，
 * 用一行副标题说明，免得用户以为点进去会是一个新页面。
 */
const PAGE_HINTS: Record<string, string> = {
  "/m/ai/chat": "入口保留",
  "/m/ai/pdf": "入口保留",
  "/m/ai/workflow": "入口保留",
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
 * 知识库不是静态注册表里的项（每个库的地址都要带 id），由调用方从
 * `useKnowledgeBasesQuery` 的缓存里补进来，见 `buildMobileBaseItems`。
 */
export function buildMobileSearchItems(): MobileSearchItem[] {
  const items: MobileSearchItem[] = [];
  const seen = new Set<string>();

  const push = (
    title: string,
    href: string | null,
    keywords: string,
    group: MobileSearchGroupKey,
    hint?: string,
  ) => {
    if (!href || seen.has(href)) return;
    seen.add(href);
    items.push({ href, title, keywords, group, hint: hint ?? PAGE_HINTS[href] });
  };

  /*
   * 桌面注册表里每个页面地址对应的**页面名**。
   *
   * 用途是把 tab 上的短名换成页面名：底栏那一格叫「AI」（四个字才放得下），
   * 但搜索结果里它指向的是「AI 对话」这一页——两处名字不同会让用户以为
   * 搜不到对话页。注册表仍是唯一真相，这里只做一次派生。
   */
  const pageTitleByHref = new Map<string, string>();
  for (const route of workspaceRoutes) {
    if (PAGE_GROUP_EXCLUDED_TITLES.has(route.title)) continue;
    const href = toMobileHref(route.href);
    if (href) pageTitleByHref.set(href, route.title);
  }

  push("创建笔记", toMobileHref(newNoteRoute.href), `${newNoteRoute.href} new note 新建`, "action");

  // tab 排在前面：空查询时这几条是用户最常用的入口
  for (const tab of mobileTabs) {
    push(pageTitleByHref.get(tab.href) ?? tab.title, tab.href, tab.href, "page");
  }
  for (const route of workspaceRoutes) {
    if (PAGE_GROUP_EXCLUDED_TITLES.has(route.title)) continue;
    push(route.title, toMobileHref(route.href), route.href, "page");
  }
  for (const route of mobileMoreRoutes) {
    push(route.title, route.href, route.href, "page");
  }

  return items;
}

/**
 * 知识库候选（M-10 图例 7）。
 *
 * 与桌面 ⌘K 的「知识库」分组同口径，数据直接取自 `useKnowledgeBasesQuery`
 * 的缓存——**不新增请求**：这一页的候选集在空查询时也要铺出来，
 * 为它单开一个查询等于把"打开搜索"变成一次网络往返。
 */
export function buildMobileBaseItems(
  bases: readonly {
    id: number;
    knowledgeBaseName?: string | null | undefined;
    detail?: string | null | undefined;
  }[],
): MobileSearchItem[] {
  return bases.map((base) => ({
    href: `/m/notes/${base.id}`,
    title: base.knowledgeBaseName?.trim() || "未命名知识库",
    keywords: `${base.detail ?? ""} /notes/${base.id}`,
    group: "base" as const,
  }));
}

export type MobileSearchGroups = {
  action: MobileSearchItem[];
  base: MobileSearchItem[];
  page: MobileSearchItem[];
};

/**
 * 过滤候选：大小写不敏感的子串匹配，标题命中排在关键词命中之前。
 *
 * 不做模糊 / 拼音匹配——那正是引入 `cmdk` 的理由，而候选集只有十几条，
 * 子串匹配已经够用。空查询返回全部，让搜索页一进去就是入口清单。
 *
 * 返回值按**分组**给：M-10 的三组要各自渲染标题，扁平的数组会让组件层
 * 再分一次组（分错一次就是"知识库"标题下混进了页面项）。
 */
export function filterMobileSearchItems(
  items: readonly MobileSearchItem[],
  query: string,
): MobileSearchGroups {
  const keyword = query.trim().toLowerCase();
  const matched = keyword ? rank(items, keyword) : [...items];

  return {
    action: matched.filter((item) => item.group === "action"),
    base: matched.filter((item) => item.group === "base"),
    page: matched.filter((item) => item.group === "page"),
  };
}

/** 标题命中排在关键词命中之前；同档保持入参顺序（分组的相对次序稳定）。 */
function rank(items: readonly MobileSearchItem[], keyword: string): MobileSearchItem[] {
  const byTitle: MobileSearchItem[] = [];
  const byKeyword: MobileSearchItem[] = [];
  for (const item of items) {
    if (item.title.toLowerCase().includes(keyword)) byTitle.push(item);
    else if (item.keywords.toLowerCase().includes(keyword)) byKeyword.push(item);
  }
  return [...byTitle, ...byKeyword];
}

/** 恰好等于整组为空——用来判定"没有结果"。 */
export function isMobileSearchEmpty(groups: MobileSearchGroups): boolean {
  return groups.action.length === 0 && groups.base.length === 0 && groups.page.length === 0;
}

/**
 * 「用「{q}」新建笔记」的出现区间（M-10 图例 13）。
 *
 * 3–15 是笔记标题本身的长度约束（`createNoteSchema`）：短于 3 的查询词
 * （"a"）建出来的标题过不了校验，长于 15 的会被截断——这两种情况下给
 * "用它新建"的按钮都是把一个必然失败的输入交给用户。
 */
export const SEARCH_CREATE_NOTE_MIN = 3;
export const SEARCH_CREATE_NOTE_MAX = 15;

export function canCreateNoteFromQuery(query: string): boolean {
  const length = query.trim().length;
  return length >= SEARCH_CREATE_NOTE_MIN && length <= SEARCH_CREATE_NOTE_MAX;
}

/** 预填标题的新建笔记地址。 */
export function createNoteFromQueryHref(query: string): string {
  return `/m/notes/new?title=${encodeURIComponent(query.trim())}`;
}

/**
 * 标题里命中片段的切分（M-10 图例：命中要**高亮**，2026-09-19 核对 V16）。
 *
 * 返回 null 表示没有命中（空查询 / 只命中关键词没命中标题），调用方原样渲染标题。
 * 大小写不敏感，与 `rank` 的匹配口径一致——两处不一致就会出现
 * "搜得到但看不到亮在哪"。
 */
export function splitTitleMatch(
  title: string,
  query: string,
): { before: string; match: string; after: string } | null {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return null;
  const index = title.toLowerCase().indexOf(keyword);
  if (index < 0) return null;
  return {
    before: title.slice(0, index),
    match: title.slice(index, index + keyword.length),
    after: title.slice(index + keyword.length),
  };
}
