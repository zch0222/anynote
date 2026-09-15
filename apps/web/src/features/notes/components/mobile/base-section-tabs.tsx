"use client";

import { knowledgeBaseSections } from "@/components/layout/navigation";
import { coverClassName } from "@/features/notes/lib/cover-gradient";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { mobileBaseSectionHref } from "@/lib/mobile/hrefs";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** 移动端真的有的四项。概览与成员没有独立页，列出来只会得到 404。 */
export const MOBILE_BASE_SECTIONS = ["notes", "mooc", "tasks", "docs"] as const;
export type MobileBaseSection = (typeof MOBILE_BASE_SECTIONS)[number];

/**
 * 知识库内的公共头部：库头（渐变块 + 一行元信息）+ 横向 Tab。
 *
 * 12.7.2 从 `note-list-mobile.tsx` 抽出来给四个 Tab 共用（笔记 / 慕课 / 任务 / 资料）。
 * 抽出来的直接理由是**切 Tab 的方式必须一致**：四个页面各写一份 `Link` 的话，
 * 只要有一个漏了 `replace`，从它切走就会往历史里压一条，
 * 返回键从此变成"在上一个 Tab 之间来回跳"而不是回知识库列表。
 *
 * 库头自己查库（`useKnowledgeBaseQuery`），调用方不必为了显示库名再取一次；
 * 命中知识库列表缓存时不会多发请求。
 */
export function MobileBaseHeader({
  baseId,
  current,
  /** 库头右侧的一行元信息，缺省只显示库类型。 */
  meta,
}: {
  baseId: number;
  current: MobileBaseSection;
  meta?: string | undefined;
}) {
  const base = useKnowledgeBaseQuery(baseId);
  const typeText = base.data?.type === 1 ? "组织知识库" : "普通知识库";

  return (
    <>
      {/*
        库头（设计稿 p08）：渐变块 + 一行「类型 · 元信息」。
        不展示 `detail`：设计稿那里只有一行，而简介可能很长，塞进来会把
        Tab 条挤到首屏之外——移动端的列表才是主角。
      */}
      <header className="flex items-center gap-3 px-4 pt-4" data-testid="mobile-base-header">
        <span className={`${coverClassName(baseId)} size-12 rounded-lg`} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-footnote text-label-secondary">
          {meta ? `${typeText} · ${meta}` : typeText}
        </span>
      </header>
      <BaseSectionTabs baseId={baseId} current={current} />
    </>
  );
}

/**
 * 知识库内的横向 Tab（笔记 / 慕课 / 任务 / 资料）。
 *
 * **用 `router.replace` 而不是直接跟随 `<Link>` 的默认 `push`**：这条横向 Tab
 * 是同一页面的视图切换，不是"往下钻一层"。用 push 的话历史会变成
 * 笔记 → 慕课 → 任务 → 资料，返回键要按四次才回到知识库列表，
 * 与画板 M-03 图例 1「返回总是回到知识库列表」矛盾。
 */
function BaseSectionTabs({
  baseId,
  current,
}: {
  baseId: number;
  current: MobileBaseSection;
}) {
  const router = useRouter();
  const tabs = knowledgeBaseSections.filter((section) =>
    (MOBILE_BASE_SECTIONS as readonly string[]).includes(section.key),
  );

  return (
    <nav
      aria-label="知识库内容"
      className="-mx-0 flex gap-2 overflow-x-auto px-4 pb-1"
      data-testid="mobile-base-tabs"
    >
      {tabs.map((section) => {
        const href = mobileBaseSectionHref(baseId, section.key as MobileBaseSection);
        const active = section.key === current;
        return (
          <Link
            key={section.key}
            href={href}
            replace
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
            data-testid={`mobile-base-tab-${section.key}`}
            // 普通点击替换历史；带修饰键的点击仍交给浏览器（新标签页 / 新窗口）
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              router.replace(href);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-footnote outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-accent font-medium text-white" : "bg-separator/40 text-label-secondary",
            )}
          >
            {section.title}
          </Link>
        );
      })}
    </nav>
  );
}
