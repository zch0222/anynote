/** 落地页文案与链接表。见 `landing-page.tsx` 顶部注释了解分工。 */

/** 顶部导航。`href` 为 `#` 的是本期还没有落点的锚（画板上是本页跳转）。 */
export type LandingNavLink = { label: string; href: string };

export const NAV_LINKS: LandingNavLink[] = [
  { label: "功能", href: "#features" },
  { label: "AI 能力", href: "#ai" },
  { label: "下载", href: "/download" },
  { label: "文档", href: "/docs" },
];

/** 首屏。 */
export const HERO = {
  badge: "全新网页版 · 现已上线",
  title: "把知识，安顿在一个安静的地方",
  /** 桌面两句，移动端只留第一句（画板 M-14 上副文就是短的）。 */
  subtitle: "知识库、笔记、慕课、任务与协同文档，收进同一个工作台。少一处切换，多一点专注。",
  subtitleMobile: "知识库、笔记、慕课、任务与协同文档，收进同一个工作台。",
  primaryCta: { label: "免费开始", href: "/register" },
  secondaryCta: { label: "了解 AI 能力", href: "#ai" },
  trust: "免费使用 · 支持自托管部署 · 数据属于你自己",
} as const;

/** 核心功能区：一行说明 + Bento 五卡。 */
export const FEATURES = {
  title: "一个工作台，装下整个知识流",
  subtitle: "从收集到消化，从个人记录到团队协作——五件工具，各司其职。",
  subtitleMobile: "五件工具，各司其职。",
} as const;

/**
 * 知识库卡片里的 5 格计数。
 *
 * 色相按 D-19 画板逐格取：笔记=品牌蓝、慕课=绿、任务=橙、资料=靛、成员=紫，
 * 与站内 D-02 概览的维度配色同源。**数字是示意值**——落地页对访客公开，
 * 不查业务接口：这一页既取不到真实数据，也不该为了营销页去拉一份。
 */
export type BentoCount = { value: string; label: string; tone: string };

export const BENTO_COUNTS: BentoCount[] = [
  { value: "128", label: "笔记", tone: "text-landing-accent" },
  { value: "6", label: "慕课", tone: "text-success" },
  { value: "12", label: "任务", tone: "text-warning" },
  { value: "34", label: "资料", tone: "text-indigo" },
  { value: "8", label: "成员", tone: "text-organization" },
];

/** AI 专区。 */
export const AI = {
  badge: "AI 能力",
  title: "AI，住进你的知识库",
  subtitle: "不是另一个聊天窗口——它读的是你自己的笔记与资料。",
  cards: [
    {
      tone: "bg-ink-accent",
      title: "AI 问答",
      body: "对话式检索你的笔记，答案注明出处，一键跳回原文。",
      question: "这个季度的复盘要点是什么？",
      answer: "根据 3 篇相关笔记，主要有 4 个要点……",
      source: "出处 · Q4 复盘纪要",
    },
    {
      tone: "bg-indigo",
      title: "PDF 问答",
      body: "拖进一份资料，索引完成即问即答。论文、合同、课件都能聊。",
      fileName: "组织设计指南.pdf",
      fileMeta: "4.2 MB · 已索引",
      question: "第 3 章的核心观点是什么？",
    },
  ],
} as const;

/** 结尾转化区。 */
export const CTA = {
  title: "现在，把知识安顿下来",
  subtitle: "注册即用；也可以把它部署在你自己的服务器上。",
  primary: { label: "免费开始", href: "/register" },
  secondary: { label: "自托管部署", href: "/docs/self-hosting" },
} as const;

/**
 * 页脚三列。
 *
 * `mobileLinks` 是移动口径，**显式写死而不是 `links.slice()`**：画板上移动版
 * 少的那一项在每列位置不同（产品列去掉末项「更新日志」，关于列去掉了中间
 * 「联系方式」），用切片会得到一份"看着对、实则错位"的清单。
 */
export type FooterColumn = {
  title: string;
  links: LandingNavLink[];
  mobileLinks: LandingNavLink[];
};

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "产品",
    links: [
      { label: "功能", href: "#features" },
      { label: "AI 能力", href: "#ai" },
      { label: "下载", href: "/download" },
      { label: "更新日志", href: "/changelog" },
    ],
    mobileLinks: [
      { label: "功能", href: "#features" },
      { label: "AI 能力", href: "#ai" },
      { label: "下载", href: "/download" },
    ],
  },
  {
    title: "资源",
    links: [
      { label: "使用文档", href: "/docs" },
      { label: "自托管指南", href: "/docs/self-hosting" },
      { label: "CLI 工具", href: "/docs/cli" },
      { label: "API", href: "/docs/api" },
    ],
    mobileLinks: [
      { label: "使用文档", href: "/docs" },
      { label: "自托管指南", href: "/docs/self-hosting" },
      { label: "CLI 工具", href: "/docs/cli" },
    ],
  },
  {
    title: "关于",
    links: [
      { label: "关于我们", href: "/about" },
      { label: "联系方式", href: "/contact" },
      { label: "隐私政策", href: "/privacy" },
      { label: "服务条款", href: "/terms" },
    ],
    mobileLinks: [
      { label: "关于我们", href: "/about" },
      { label: "隐私政策", href: "/privacy" },
      { label: "服务条款", href: "/terms" },
    ],
  },
];

export const FOOTER = {
  tagline: "安静、高效的知识工作站。把笔记、课程、任务和协作，放进同一个地方。",
  taglineMobile: "安静、高效的知识工作站。",
  copyright: "© 2026 Anynote. 保留所有权利。",
  locale: "简体中文 · 服务状态",
} as const;
