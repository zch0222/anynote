import {
  BookOpen,
  Bot,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Network,
  NotebookPen,
  Settings,
  UserRound,
  Workflow,
} from "lucide-react";

export const navigationGroups = [
  {
    label: "工作空间",
    items: [
      {
        title: "工作台",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "从这里开始，记录与整理你的想法。",
      },
      {
        title: "笔记",
        href: "/notes",
        icon: NotebookPen,
        description: "捕捉灵感，让每一个想法都有归处。",
      },
      { title: "文档", href: "/docs", icon: FileText, description: "集中整理和阅读你的文档。" },
      {
        title: "知识库",
        href: "/wikis",
        icon: BookOpen,
        description: "连接知识，构建属于你的知识库。",
      },
    ],
  },
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
    label: "学习与计划",
    items: [
      {
        title: "课程",
        href: "/mooc",
        icon: GraduationCap,
        description: "整理课程与学习资料，持续积累。",
      },
      {
        title: "任务",
        href: "/tasks",
        icon: ListTodo,
        description: "把想法拆成行动，让计划逐步实现。",
      },
    ],
  },
] as const;

export const settingsRoute = {
  title: "设置",
  href: "/settings/profile",
  icon: Settings,
  description: "管理你的个人资料与使用偏好。",
};
export const workspaceRoutes = [
  ...navigationGroups.flatMap((group) => [...group.items]),
  settingsRoute,
];
export const newNoteRoute = {
  title: "创建笔记",
  href: "/notes/new",
  icon: Network,
  description: "新的想法，从这里开始。",
};

export function isRouteActive(pathname: string, href: string) {
  const root = href === settingsRoute.href ? "/settings" : href;
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function getWorkspaceRoute(pathname: string) {
  if (pathname === newNoteRoute.href) return newNoteRoute;
  return workspaceRoutes.find((route) => isRouteActive(pathname, route.href));
}

export const themeOptions = [
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
  { value: "system", label: "跟随系统" },
] as const;

/* ------------------------------------------------------------------ *
 * 移动端（M10.1 / 方案 D3）
 *
 * 移动端不另立一份路由真相：tab 与映射都从上面的桌面注册表推导，
 * 新增桌面路由时只需要在 MOBILE_ROUTE_PREFIXES 里决定"移动端有没有对应页"。
 * ------------------------------------------------------------------ */

/** 移动端路由前缀。URL 里要出现，否则两套版式的地址会撞在一起。 */
export const MOBILE_PREFIX = "/m";

/**
 * 底部 tab。5 格是 375px 下的硬上限（再多每格不足 72px），
 * 因此"待办"不占格：入口在工作台卡片与「我的」里。
 *
 * `match` 是高亮用的前缀集合，让子路由也能点亮所属 tab
 * （如 `/m/wikis/3/7` 归"笔记"、`/m/settings/ai` 归"我的"）。
 */
export const mobileTabs = [
  { title: "工作台", href: "/m/dashboard", icon: LayoutDashboard, match: ["/m/dashboard"] },
  { title: "笔记", href: "/m/notes", icon: NotebookPen, match: ["/m/notes", "/m/wikis"] },
  { title: "文档", href: "/m/docs", icon: FileText, match: ["/m/docs"] },
  { title: "AI", href: "/m/ai/chat", icon: MessageSquare, match: ["/m/ai"] },
  { title: "我的", href: "/m/me", icon: UserRound, match: ["/m/me", "/m/settings"] },
] as const;

export type MobileTab = (typeof mobileTabs)[number];

/**
 * 有移动端对应页的桌面路由前缀。
 *
 * `/ai/workflow` 不在列内（决策 4：移动端不提供画布），`/playground` 同理。
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
  { title: "知识库", href: "/m/wikis", icon: BookOpen, description: "浏览知识库里的笔记。" },
  { title: "任务", href: "/m/tasks", icon: ListTodo, description: "查看并提交我的任务。" },
  { title: "课程", href: "/m/mooc", icon: GraduationCap, description: "继续未看完的课程。" },
  { title: "PDF 问答", href: "/m/ai/pdf", icon: Bot, description: "围绕 PDF 文档提问。" },
] as const;

/** 只在桌面版提供的能力：移动端给说明 + 桌面版链接（决策 4）。 */
export const mobileUnavailableRoutes = [
  {
    title: "AI 工作流",
    desktopHref: "/ai/workflow",
    icon: Workflow,
    reason: "画布需要拖拽与大屏，请在桌面版使用。",
  },
] as const;
