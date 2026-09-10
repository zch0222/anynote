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
