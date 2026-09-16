"use client";

import { PageSearchAction } from "@/components/layout/page-search-action";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * 知识库内 Tab 页的统一内容列宽（D-01 / D-05 / D-07 / D-08 / D-09 / D-02）。
 *
 * 补稿画板五张 Tab 页的内容列**统一是 1000px**（x 368–1368，侧栏 296 之后居中）。
 * 实现里曾经三种口径并存（896 = `max-w-4xl`、1080 = `max-w-6xl`、1000 = 概览页），
 * 只有概览页恰好对上。这里收敛成一处常量，避免下次再各写各的。
 *
 * 用 `max-w-[1000px]` 而不是某个 `max-w-*` 档位：Tailwind 的档位里没有 1000，
 * 而就近的 `max-w-5xl`（1024）与画板差 24px，在一张 1440 宽、内容居中的页面上
 * 肉眼可辨（左右各差 12px）。
 */
export const KB_CONTENT_COLUMN = "mx-auto w-full max-w-[1000px]";

/**
 * 知识库内 Tab 页的页头（D-01 / D-05 / D-07 / D-08 / D-09）。
 *
 * 三件事一次做对，因为这三个都是"四个页面各写一遍就会漂移"的地方：
 *
 * 1. **H1 用 Display 字阶**（34/41 SemiBold）。画板实测标题墨迹行高 31px（CSS），
 *    而 `text-title` 是 22/28、墨迹只有 21px。四个页面曾经都用 `text-title`，
 *    只有 D-07 与概览页用了 `text-display`——同一层级两种字号，扫过去就是"没对齐"。
 * 2. **动作行**：搜索 + 主题（两个 34 高图标按钮）在右端，主按钮紧随其后。
 *    这一页**没有顶栏**（见 `isKnowledgeBaseTabRoute`），所以要由页头自己给出；
 *    少了它命令面板就只剩 ⌘K 一条入口。
 * 3. **副标题口径**：画板报的是**真实统计**（`128 篇笔记 · 最近更新于 2 小时前`、
 *    `6 门课程 · 最近更新于 2 小时前`、`9 份资料 · 7 份已索引`），
 *    而不是一句固定文案。固定文案在数据为空时与不为空时读起来一模一样，
 *    用户没法从页头判断"这个库到底有没有东西"。
 *
 * `title` 之外的形态差异（页头是否要有 badge、副标题怎么算）留在各页面，
 * 本组件只管**共同的骨架**。
 */
export function KnowledgeBasePageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  /** 副标题：画板口径是"真实统计"，由各页面自己算。 */
  subtitle: ReactNode;
  /** 主按钮（新建笔记 / 新建课程 / 新建任务 / 上传 PDF）。 */
  actions?: ReactNode;
  /** 需要更多元素时（未使用，保留给后续） */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-display text-label" data-testid="kb-page-title">
          {title}
        </h1>
        <p className="text-footnote text-label-secondary">{subtitle}</p>
      </div>
      <div className={cn("flex shrink-0 items-center gap-1", actions ? "pt-1" : undefined)}>
        <PageSearchAction />
        <ThemeSwitcher />
        {actions ? <div className="ml-1 flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
