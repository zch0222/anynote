"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { MobileBaseHeader } from "@/features/notes/components/mobile/base-section-tabs";
import { DEFAULT_PAGE_SIZE } from "@/features/notes/schemas";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { NotebookPen, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type MobileNoteListProps = {
  baseId: number;
  showCreate?: boolean;
};

/**
 * `/m/notes/[baseId]`：知识库详情 · 笔记 Tab。
 *
 * 版式对齐设计稿：顶栏（返回 + 库名 + 新建）→ 库头（渐变块 + 类型/篇数）
 * → 横向 Tab（笔记 / 慕课 / 任务 / 资料）→ 笔记行列表。
 *
 * 库头与 Tab 走 12.7.2 抽出的 `MobileBaseHeader`，四个 Tab 共用同一份。
 * 翻页复用桌面同一个 `useNotesQuery`（按页取、不是无限滚动），
 * 所以这里是"换页"而不是"累积追加"。
 */
export function MobileNoteList({ baseId, showCreate = true }: MobileNoteListProps) {
  const [page, setPage] = useState(1);
  const base = useKnowledgeBaseQuery(baseId);
  const notes = useNotesQuery({
    knowledgeBaseId: baseId,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const totalPages = notes.data?.pages ?? 1;
  const title = base.data?.knowledgeBaseName?.trim() || "知识库";

  return (
    <MobileScreen
      title={title}
      back="/m/notes"
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
        <MobileBaseHeader
          baseId={baseId}
          current="notes"
          meta={notes.data?.total ? `${notes.data.total} 篇笔记` : undefined}
        />

        <div className="px-4">
          {notes.isPending ? (
            <ListRowsSkeleton count={3} />
          ) : notes.isError ? (
            <QueryError
              object="笔记"
              message={toUserMessage(notes.error)}
              onRetry={() => void notes.refetch()}
              retrying={notes.isFetching}
            />
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
                      href={`/m/notes/${baseId}/${note.id}`}
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
