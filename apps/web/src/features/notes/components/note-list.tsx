"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE, type NoteListItem } from "@/features/notes/schemas";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, NotebookPen, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateNoteDialog } from "./create-note-dialog";

/**
 * 知识库「笔记」Tab（`/notes/[baseId]`）。
 *
 * 设计稿里笔记是**列表**而不是卡片网格：一篇笔记的辨识信息主要是标题 + 更新时间，
 * 用卡片会把一屏能看的条数砍掉一半，而笔记恰恰是最需要快速扫过去的一类。
 */
export function NoteList({ baseId }: { baseId: number }) {
  const [page, setPage] = useState(1);
  const base = useKnowledgeBaseQuery(baseId);
  const notes = useNotesQuery({ knowledgeBaseId: baseId, page, pageSize: DEFAULT_PAGE_SIZE });
  const totalPages = notes.data?.pages ?? 1;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4" data-testid="note-list">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-title text-label">笔记</h1>
          <p className="text-footnote text-label-secondary">
            {notes.data?.total
              ? `${base.data?.knowledgeBaseName?.trim() || "知识库"} · 共 ${notes.data.total} 篇`
              : "捕捉灵感，让每一个想法都有归处。"}
          </p>
        </div>
        <CreateNoteDialog
          knowledgeBaseId={baseId}
          triggerTestId="note-create"
          trigger={
            <>
              <Plus className="size-4" aria-hidden="true" />
              新建笔记
            </>
          }
          triggerClassName="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-footnote font-medium text-white outline-none transition-colors hover:bg-accent/85 focus-visible:ring-2 focus-visible:ring-ring"
        />
      </header>

      {notes.isPending ? (
        <NoteListSkeleton />
      ) : notes.isError ? (
        <p role="alert" className="rounded-lg bg-danger/5 p-6 text-footnote text-danger">
          笔记加载失败：{notes.error.message}
        </p>
      ) : notes.data.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-separator p-10 text-center">
          <NotebookPen className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
          <p className="mt-3 text-headline text-label">这个知识库还没有笔记</p>
          <p className="mt-1 text-footnote text-label-secondary">新建一篇，开始记录。</p>
        </div>
      ) : (
        <>
          <ul
            className="divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-card"
            data-testid="note-list-items"
          >
            {notes.data.rows.map((note) => (
              <li key={note.id}>
                <NoteRow baseId={baseId} note={note} />
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <nav aria-label="分页" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                上一页
              </Button>
              <span className="tabular text-footnote text-label-secondary">
                第 {page} / {totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                下一页
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function NoteRow({ baseId, note }: { baseId: number; note: NoteListItem }) {
  // 列表页优先展示"最后一次动过"的时间；没有操作记录才退回更新时间
  const touched = note.latestOperationTime ?? note.updateTime;
  return (
    <Link
      href={`/notes/${baseId}/${note.id}`}
      data-testid={`note-row-${note.id}`}
      className={cn(
        "flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none transition-colors",
        "hover:bg-grouped focus-visible:bg-grouped focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      )}
    >
      <NotebookPen className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-body text-label">
        {note.title?.trim() || "未命名笔记"}
      </span>
      <span className="tabular shrink-0 text-xs text-label-tertiary">
        {formatRelativeTime(touched)}
      </span>
    </Link>
  );
}

function NoteListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      {["a", "b", "c", "d", "e"].map((key) => (
        <Skeleton key={key} className="h-14 rounded-lg" />
      ))}
    </div>
  );
}
