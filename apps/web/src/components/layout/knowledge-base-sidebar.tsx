"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { coverClassName } from "@/features/notes/lib/cover-gradient";
import type { KnowledgeBase } from "@/features/notes/schemas";
import { cn } from "@/lib/utils";
import { ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { knowledgeBaseSectionHref, knowledgeBaseSections } from "./navigation";

/**
 * 侧栏进入知识库后的「当前知识库」卡片。
 *
 * 设计稿里它取代了「知识库列表」成为侧栏的头部：进了某个知识库之后，
 * 侧栏关心的不再是"我有哪些库"，而是"我在哪个库、这个库有什么"。
 * 切库的入口收进卡片右侧的上下箭头（回画廊页去挑）。
 */
export function SidebarKnowledgeBaseCard({
  base,
  isPending,
  noteCount,
}: {
  base: KnowledgeBase | undefined;
  isPending: boolean;
  noteCount?: number | undefined;
}) {
  const name = base?.knowledgeBaseName?.trim() || "知识库";
  const typeLabel = base?.type === 1 ? "组织知识库" : "普通知识库";

  return (
    <Link
      href="/notes"
      data-testid="sidebar-kb-card"
      className={cn(
        // 264x48（D-01 图例 2）：封面 36、圆角 10、白底 shadow-card。
        // `mx-1.5` 是相对侧栏内容内缩（10）再补 6：画板里卡片左缘在 16，
        // 而导航项 tint 从 10 起——卡片比导航项**多缩 6**，不是同一档内边距。
        "mx-1.5 flex min-h-12 items-center gap-3 rounded-md bg-surface px-3 py-1.5 shadow-card outline-none transition-shadow",
        "hover:shadow-popover focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(coverClassName(base?.id ?? 0), "size-9 shrink-0 rounded-md")}
      />
      <span className="min-w-0 flex-1">
        {isPending ? (
          <>
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="mt-1 h-3 w-20" />
          </>
        ) : (
          <>
            <span className="block truncate text-footnote font-semibold text-label">{name}</span>
            <span className="tabular block truncate text-[11px] text-label-tertiary">
              {typeLabel}
              {typeof noteCount === "number" ? ` · ${noteCount} 篇笔记` : ""}
            </span>
          </>
        )}
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
    </Link>
  );
}

/** 某个二级条目右侧的计数。只在拿到确切数字时才渲染，避免显示假数据。 */
export type SectionCounts = Partial<Record<"notes" | "mooc" | "tasks", number | undefined>>;

/**
 * 知识库内的二级导航。
 *
 * 设计稿把它放在**侧栏**而不是顶栏：知识库是唯一顶层对象，
 * 它的子资源属于"我在这个库里能去哪儿"，与全局导航是同一层级的事。
 * 顶栏因此腾出来专门说明"我在看哪篇笔记"。
 */
export function SidebarKnowledgeBaseNav({
  baseId,
  activeSection,
  counts,
}: {
  baseId: number;
  activeSection: string;
  counts: SectionCounts;
}) {
  return (
    <section>
      <p className="px-2 pb-1 pt-4 text-footnote text-label-tertiary">知识库内容</p>
      <nav aria-label="知识库内容" className="space-y-0.5">
        {knowledgeBaseSections.map((section) => {
          const active = section.key === activeSection;
          const count = counts[section.key as keyof SectionCounts];
          const Icon = section.icon;
          return (
            <Link
              key={section.key}
              href={knowledgeBaseSectionHref(baseId, section.key)}
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : "false"}
              data-testid={`kb-tab-${section.key}`}
              className={cn(
                "flex min-h-9 items-center gap-2.5 rounded-md px-2 py-1.5 text-body outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-label hover:bg-separator/40",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] shrink-0",
                  active ? "text-accent" : "text-label-secondary",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{section.title}</span>
              {typeof count === "number" ? (
                <span
                  className={cn(
                    "tabular shrink-0 text-footnote",
                    active ? "text-accent" : "text-label-tertiary",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

/**
 * 侧栏下半段的「笔记目录」。
 *
 * 设计稿在「知识库内容」与它之间放了一条分隔线，说明这是**同一层级里的另一棵树**：
 * 上面是"这个库有哪些面"，下面是"库里的笔记有哪些"。
 *
 * 这里刻意是**静态列表**，不带拖拽：设计稿没有拖拽手柄，而 dnd-kit 一旦被侧栏
 * 静态引入就会进所有工作区路由的首屏包（实测 +5KB，`/notes` 直接贴到 300KB 预算线）。
 * 「把笔记移到别的知识库」由编辑器的操作菜单承担（见 `note-editor.tsx`），
 * 那条路径既不需要拖动、在移动端也能用。
 */
export function SidebarNoteDirectory({
  notes,
  isLoading,
  baseId,
  activeNoteId,
  hidden,
}: {
  notes: readonly { id: number; title: string; meta?: string | undefined }[];
  isLoading: boolean;
  baseId: number;
  activeNoteId?: number | undefined;
  /** 非「笔记」面时整块收起；用 `hidden` 而不是卸载，避免切 Tab 时列表闪烁。 */
  hidden?: boolean;
}) {
  return (
    <section
      aria-label="笔记目录"
      data-testid="sidebar-note-directory"
      className={cn("mt-3 border-t border-separator pt-3", hidden && "hidden")}
    >
      <p className="px-2 pb-1 text-footnote text-label-tertiary">笔记目录</p>
      {isLoading ? (
        <div className="space-y-1.5 px-2 py-1" aria-busy="true">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-4/5" />
        </div>
      ) : notes.length === 0 ? (
        <p className="px-2 py-1.5 text-footnote text-label-tertiary">还没有笔记</p>
      ) : (
        <nav aria-label="笔记列表" className="space-y-0.5">
          {notes.map((note) => (
            <SidebarNoteItem
              key={note.id}
              noteId={note.id}
              baseId={baseId}
              title={note.title}
              meta={note.meta}
              active={note.id === activeNoteId}
            />
          ))}
        </nav>
      )}
    </section>
  );
}

/** 笔记目录里的一条：标题 +（可选）摘要行，当前笔记用白底卡片浮起来。 */
function SidebarNoteItem({
  noteId,
  baseId,
  title,
  meta,
  active,
}: {
  noteId: number;
  baseId: number;
  title: string;
  meta?: string | undefined;
  active: boolean;
}) {
  return (
    <Link
      href={`/notes/${baseId}/${noteId}`}
      aria-current={active ? "page" : undefined}
      data-testid={`sidebar-note-${noteId}`}
      className={cn(
        "block rounded-md px-2 py-1.5 outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-surface shadow-card" : "hover:bg-separator/40",
      )}
    >
      <span
        className={cn(
          "block truncate text-footnote",
          active ? "font-medium text-accent" : "text-label",
        )}
      >
        {title}
      </span>
      {meta ? (
        <span className="mt-0.5 block truncate text-xs text-label-tertiary">{meta}</span>
      ) : null}
    </Link>
  );
}
