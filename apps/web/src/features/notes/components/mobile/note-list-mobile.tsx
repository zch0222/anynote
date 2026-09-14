"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { knowledgeBaseSections } from "@/components/layout/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { coverClassName } from "@/features/notes/lib/cover-gradient";
import { DEFAULT_PAGE_SIZE } from "@/features/notes/schemas";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { NotebookPen, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type MobileNoteListProps = {
  baseId: number;
  /** 详情页前缀：`/m/notes` 进编辑器，`/m/wikis` 进只读阅读页。 */
  basePath?: "/m/notes" | "/m/wikis";
  showCreate?: boolean;
};

/**
 * `/m/notes/[baseId]` 与 `/m/wikis/[baseId]`：知识库详情。
 *
 * 版式对齐设计稿：顶栏（返回 + 库名 + 更多）→ 库头（渐变块 + 类型/篇数）
 * → 横向 Tab（笔记 / 慕课 / 任务 / 资料）→ 笔记卡片列表。
 *
 * 只读浏览（`/m/wikis`）不带 Tab 与新建入口——它的语义就是"看"。
 * 翻页复用桌面同一个 `useNotesQuery`（按页取、不是无限滚动），
 * 所以这里是"换页"而不是"累积追加"。
 */
export function MobileNoteList({
  baseId,
  basePath = "/m/notes",
  showCreate = true,
}: MobileNoteListProps) {
  const [page, setPage] = useState(1);
  const base = useKnowledgeBaseQuery(baseId);
  const notes = useNotesQuery({
    knowledgeBaseId: baseId,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const totalPages = notes.data?.pages ?? 1;
  const title = base.data?.knowledgeBaseName?.trim() || "知识库";
  const editable = basePath === "/m/notes";

  return (
    <MobileScreen
      title={title}
      back={basePath}
      actions={
        showCreate ? (
          <Link
            href={`/m/notes/new?baseId=${baseId}`}
            aria-label="新建笔记"
            data-testid="mobile-note-create"
            className="grid size-10 place-items-center rounded-full bg-accent text-white outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      <div className="space-y-4 pb-4" data-testid="mobile-note-list">
        {/*
          库头（设计稿 p08）：渐变块 + 一行「类型 · 篇数」。
          不展示 `detail`：设计稿那里只有一行，而简介可能很长，塞进来会把
          Tab 条挤到首屏之外——移动端的正文才是主角。
        */}
        <header className="flex items-center gap-3 px-4 pt-4" data-testid="mobile-base-header">
          <span className={`${coverClassName(baseId)} size-12 rounded-lg`} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-footnote text-label-secondary">
            {base.data?.type === 1 ? "组织知识库" : editable ? "普通知识库" : "只读浏览"}
            {notes.data?.total ? ` · ${notes.data.total} 篇笔记` : ""}
          </span>
        </header>

        {editable ? <BaseSectionTabs baseId={baseId} /> : null}

        <div className="px-4">
          {notes.isPending ? (
            <div className="space-y-2" aria-busy="true">
              {["a", "b", "c"].map((key) => (
                <Skeleton key={key} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : notes.isError ? (
            <p role="alert" className="rounded-lg bg-danger/5 p-4 text-footnote text-danger">
              笔记加载失败：{notes.error.message}
            </p>
          ) : notes.data.rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-separator p-6 text-center">
              <NotebookPen className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
              <p className="mt-3 text-headline text-label">这个知识库还没有笔记</p>
              <p className="mt-1 text-footnote text-label-secondary">
                {showCreate ? "新建一篇，开始记录。" : "等有人往这个库里写点什么再来看看。"}
              </p>
            </div>
          ) : (
            <>
              {/*
                行列表而不是卡片堆（设计稿 p08）：整页一个白底，行与行之间用
                1px 分隔线。卡片会把每行的上下留白叠起来，一屏少看两条。
              */}
              <ul className="overflow-hidden rounded-lg bg-surface" data-testid="mobile-note-items">
                {notes.data.rows.map((note) => (
                  <li key={note.id} className="border-b border-separator last:border-b-0">
                    <Link
                      href={`${basePath}/${baseId}/${note.id}`}
                      data-testid={`mobile-note-${note.id}`}
                      className={cn(
                        "block min-h-16 px-3 py-3 outline-none",
                        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      )}
                    >
                      <span className="block truncate text-headline font-semibold text-label">
                        {note.title?.trim() || "未命名笔记"}
                      </span>
                      <span className="mt-1 block truncate text-footnote text-label-tertiary">
                        {note.updateTime
                          ? `${formatRelativeTime(note.updateTime)}更新`
                          : "暂无更新记录"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {totalPages > 1 ? (
                <div className="mt-4 flex items-center gap-2" data-testid="mobile-note-pager">
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1"
                    disabled={page <= 1 || notes.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    上一页
                  </Button>
                  <span className="tabular shrink-0 text-xs text-label-secondary">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1"
                    disabled={page >= totalPages || notes.isFetching}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    data-testid="mobile-note-next"
                  >
                    下一页
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </MobileScreen>
  );
}

/**
 * 知识库内的横向 Tab。
 *
 * 只列**移动端真的有页面**的四项：概览与成员在移动端没有独立页
 * （概览的信息已铺在这页头部），列出来只会得到 404。
 */
function BaseSectionTabs({ baseId }: { baseId: number }) {
  const tabs = knowledgeBaseSections.filter((section) =>
    (["notes", "mooc", "tasks", "docs"] as const).includes(
      section.key as "notes" | "mooc" | "tasks" | "docs",
    ),
  );

  return (
    <nav
      aria-label="知识库内容"
      className="-mx-0 flex gap-2 overflow-x-auto px-4 pb-1"
      data-testid="mobile-base-tabs"
    >
      {tabs.map((section) => {
        const href =
          section.key === "notes" ? `/m/notes/${baseId}` : `/m/notes/${baseId}/${section.key}`;
        const active = section.key === "notes";
        return (
          <Link
            key={section.key}
            href={href}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
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
