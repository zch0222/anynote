import {
  BookOpen,
  Bot,
  CheckSquare,
  FileText,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  NotebookPen,
  Settings,
  Sparkles,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * 信息架构（对齐 UI 重设计 §2）
 *
 * 后端 `n_knowledge_base` 是入口实体：笔记 / 慕课 / 任务 / 资料 / 成员
 * 全部通过 `knowledge_base_id` 归属其下。导航层级必须复刻这个结构，
 * 而不是把四类子资源平铺成同级入口——那会让人看不出从属关系。
 *
 * 因此一级导航只有三类：
 *   1. 知识库（动态列表，来自 `useKnowledgeBasesQuery`）
 *   2. AI 助手（跨知识库能力）
 *   3. 协作（跨知识库能力：协同文档库）
 * 设置不进一级导航，它在侧栏页脚的用户卡里。
 * ------------------------------------------------------------------ */

export type NavItem = {
  title: string;
  href: string;
  icon: typeof BookOpen;
  description: string;
};

/** 知识库为根之后的二级 Tab。`overview` 是页内锚点，其余各自是路由。 */
export const knowledgeBaseSections = [
  { key: "overview", title: "概览", icon: LayoutDashboard },
  { key: "notes", title: "笔记", icon: NotebookPen },
  { key: "mooc", title: "慕课", icon: BookOpen },
  { key: "tasks", title: "任务", icon: CheckSquare },
  { key: "docs", title: "资料", icon: FolderOpen },
  { key: "members", title: "成员", icon: Users },
] as const;

export type KnowledgeBaseSection = (typeof knowledgeBaseSections)[number]["key"];

/**
 * 二级 Tab 的地址。
 *
 * 「笔记」是知识库的默认落地页，走裸路径 `/notes/:id`；其余各占一段。
 * 段名都是**静态**的，Next 的路由优先级会把它们排在 `[noteId]` 之前，
 * 而笔记 id 恒为正整数，因此不会与编辑器路由互抢。
 */
export function knowledgeBaseSectionHref(baseId: number, section: KnowledgeBaseSection) {
  return section === "notes" ? `/notes/${baseId}` : `/notes/${baseId}/${section}`;
}

/** 反解当前命中哪个二级 Tab；`noteId` 存在时说明在编辑器里。 */
export function parseKnowledgeBaseSection(segment: string | undefined): KnowledgeBaseSection {
  const found = knowledgeBaseSections.find((section) => section.key === segment);
  return found ? found.key : "notes";
}

/** 移动端二级 Tab 的地址前缀与桌面不同（要多一层 `/m`）。 */
export function mobileKnowledgeBaseSectionHref(baseId: number, section: KnowledgeBaseSection) {
  return section === "notes" ? `/m/notes/${baseId}` : `/m/notes/${baseId}/${section}`;
}

/** AI 助手与协作：不挂在任何单个知识库下的能力，单独成组。 */
export const toolGroups = [
  {
    label: "AI 助手",
    items: [
      {
        title: "AI 对话",
        href: "/ai/chat",
        icon: MessageSquare,
        description: "与 AI 一起探索问题，拓展思路。",
      },
      {
        title: "AI 工作流",
        href: "/ai/workflow",
        icon: Workflow,
        description: "将重复的工作串联为自动化流程。",
      },
      {
        title: "PDF 问答",
        href: "/ai/pdf",
        icon: Bot,
        description: "围绕文档提问，更快理解关键信息。",
      },
    ],
  },
  {
    label: "协作",
    items: [
      {
        title: "协同文档",
        href: "/docs",
        icon: FileText,
        description: "多人实时协作的文档库。",
      },
    ],
  },
] as const satisfies readonly { label: string; items: readonly NavItem[] }[];

/**
 * 一级「知识库」入口本身也是可点的（去画廊页）。
 * 它是侧栏动态列表的表头，所以不进 `workspaceRoutes`。
 */
export const knowledgeBaseRoute: NavItem = {
  title: "知识库",
  href: "/notes",
  icon: BookOpen,
  description: "为一组相关的笔记、慕课与任务创建独立空间。",
};

export const settingsRoute: NavItem = {
  title: "设置",
  href: "/settings/profile",
  icon: Settings,
  description: "管理你的个人资料与使用偏好。",
};

/** 画廊页「新建知识库」之外的次级入口，保留 `/notes/new` 的深链与命令面板可达性。 */
export const newNoteRoute: NavItem = {
  title: "创建笔记",
  href: "/notes/new",
  icon: Sparkles,
  description: "新的想法，从这里开始。",
};

/**
 * 命令面板与「当前页属于哪个入口」的扁平注册表。
 *
 * 只收**跨知识库**的固定路由：知识库本身是数据驱动的（每个库的地址都要
 * 带上它的 id），由面板单独从 query 缓存里取，不在这里写死。
 */
export const workspaceRoutes: readonly NavItem[] = [
  knowledgeBaseRoute,
  ...toolGroups.flatMap((group) => [...group.items]),
  newNoteRoute,
  settingsRoute,
];

export function isRouteActive(pathname: string, href: string) {
  const root = href === settingsRoute.href ? "/settings" : href;
  return pathname === root || pathname.startsWith(`${root}/`);
}

/**
 * 满幅路由：内容区**不留内边距**，由页面自己吃到视口边缘的页面。
 *
 * 只有笔记编辑器：设计稿里它的顶栏分隔线与正文底色一直延伸到侧栏右侧与窗口右缘，
 * 外面再套一层 20/32px 的留白，正文就成了一块浮在灰底上的卡片——
 * 与「编辑器占满剩余所有空间」正好相反。
 *
 * 必须按**数字段**判定：`/notes/7/42` 是编辑器，而 `/notes/7/overview`、
 * `/notes/7/members` 这些二级页是普通文档流页面，仍然要有留白。
 */
export function isFullBleedRoute(pathname: string): boolean {
  return /^\/notes\/\d+\/\d+$/.test(pathname);
}

export function getWorkspaceRoute(pathname: string) {
  if (pathname === newNoteRoute.href) return newNoteRoute;
  return workspaceRoutes.find((route) => isRouteActive(pathname, route.href));
}

export const themeOptions = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
] as const;

/* ------------------------------------------------------------------ *
 * 移动端
 *
 * 移动端不另立一份路由真相：tab 与映射都从上面的桌面注册表推导，
 * 新增桌面路由时只需要在 MOBILE_ROUTE_PREFIXES 里决定"移动端有没有对应页"。
 * ------------------------------------------------------------------ */

/** 移动端路由前缀。URL 里要出现，否则两套版式的地址会撞在一起。 */
export const MOBILE_PREFIX = "/m";

/**
 * 底部 tab（对齐 UI 重设计 §移动端：工作台 / 知识库 / AI / 我的）。
 *
 * 4 格而不是 5 格：设计稿把「文档」收进「我的」，因为协同文档库是低频入口，
 * 而知识库才是移动端的核心对象。每格因此宽到 96px（375px 下），
 * 触摸目标与文字都不再挤。
 *
 * `match` 是高亮用的前缀集合，让子路由也能点亮所属 tab
 * （如 `/m/notes/3/7` 归「知识库」、`/m/settings/ai` 归「我的」）。
 */
export const mobileTabs = [
  { title: "工作台", href: "/m/dashboard", icon: LayoutDashboard, match: ["/m/dashboard"] },
  { title: "知识库", href: "/m/notes", icon: BookOpen, match: ["/m/notes", "/m/wikis"] },
  { title: "AI", href: "/m/ai/chat", icon: Sparkles, match: ["/m/ai"] },
  { title: "我的", href: "/m/me", icon: UserRound, match: ["/m/me", "/m/settings"] },
] as const;

export type MobileTab = (typeof mobileTabs)[number];

/**
 * 有移动端对应页的桌面路由前缀。
 *
 * `/ai/workflow` 不在列内（画布需要拖拽与大屏），`/playground` 同理。
 * 匹配按**整段**比较，避免 `/ai/chat` 的前缀吃掉 `/ai/chatroom` 这类将来的路由。
 */
const MOBILE_ROUTE_PREFIXES = [
  "/dashboard",
  "/notes",
  "/docs",
  "/wikis",
  "/tasks",
  "/mooc",
  "/ai/chat",
  "/ai/pdf",
  "/settings",
  "/search",
] as const;

/** 拆出 path 与 query/hash，映射只作用在 path 上，参数原样带走。 */
function splitHref(href: string): [string, string] {
  const index = href.search(/[?#]/);
  return index === -1 ? [href, ""] : [href.slice(0, index), href.slice(index)];
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** 是否是移动端路由（按路径段判断，`/mooc` 不算）。 */
export function isMobilePath(pathname: string): boolean {
  return pathname === MOBILE_PREFIX || pathname.startsWith(`${MOBILE_PREFIX}/`);
}

/**
 * 桌面路由 → 移动端路由；没有对应页时返回 `null`（调用方据此给"去桌面版"的说明）。
 */
export function toMobileHref(desktopHref: string): string | null {
  const [path, rest] = splitHref(desktopHref);
  if (isMobilePath(path)) return desktopHref;
  if (path === "/") return `${MOBILE_PREFIX}/dashboard${rest}`;
  const matched = MOBILE_ROUTE_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
  return matched ? `${MOBILE_PREFIX}${path}${rest}` : null;
}

/** 移动端路由 → 桌面路由，用于"切换到桌面版"。非移动端地址原样返回。 */
export function toDesktopHref(mobileHref: string): string {
  const [path, rest] = splitHref(mobileHref);
  if (!isMobilePath(path)) return mobileHref;
  const stripped = path.slice(MOBILE_PREFIX.length);
  // `/m` 自身以及移动端独有的页面（/m/me、/m/search）回退到桌面工作台
  if (stripped === "" || stripped === "/") return `/dashboard${rest}`;
  if (matchesPrefix(stripped, "/me")) return `/settings/profile${rest}`;
  return `${stripped}${rest}`;
}

/** 当前路径命中的 tab；没有命中返回 `undefined`（如 `/m/tasks`）。 */
export function activeMobileTab(pathname: string): MobileTab | undefined {
  return mobileTabs.find((tab) => tab.match.some((prefix) => isRouteActive(pathname, prefix)));
}

/**
 * 沉浸式路由：隐藏底部 tab bar 的页面。
 *
 * 都是"进去就专心做一件事"的详情页——编辑器、对话、阅读、搜索。
 * 用显式模式表而不是 CSS `:has()`：判定要能被单测覆盖，也不依赖浏览器支持。
 */
const IMMERSIVE_PATTERNS = [
  /^\/m\/notes\/[^/]+\/[^/]+$/,
  /^\/m\/wikis\/[^/]+\/[^/]+$/,
  /^\/m\/docs\/[^/]+$/,
  /^\/m\/ai\/chat\/[^/]+$/,
  /^\/m\/ai\/pdf\/[^/]+$/,
  /^\/m\/search$/,
];

export function isImmersiveMobileRoute(pathname: string): boolean {
  return IMMERSIVE_PATTERNS.some((pattern) => pattern.test(pathname));
}

/** 「我的」页里的更多入口：tab 放不下、但移动端仍然可用的页面。 */
export const mobileMoreRoutes = [
  { title: "协同文档", href: "/m/docs", icon: FileText, description: "多人实时协作的文档库。" },
  { title: "任务", href: "/m/tasks", icon: CheckSquare, description: "查看并提交我的任务。" },
  { title: "慕课", href: "/m/mooc", icon: BookOpen, description: "继续未看完的课程。" },
  { title: "PDF 问答", href: "/m/ai/pdf", icon: Bot, description: "围绕 PDF 文档提问。" },
] as const;

/** 只在桌面版提供的能力：移动端给说明 + 桌面版链接。 */
export const mobileUnavailableRoutes = [
  {
    title: "AI 工作流",
    desktopHref: "/ai/workflow",
    icon: Workflow,
    reason: "画布需要拖拽与大屏，请在桌面版使用。",
  },
] as const;
