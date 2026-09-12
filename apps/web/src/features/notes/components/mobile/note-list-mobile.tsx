"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE } from "@/features/notes/schemas";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { FileText, NotebookPen, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type MobileNoteListProps = {
  baseId: number;
  /** 详情页前缀：`/m/notes` 进编辑器，`/m/wikis` 进只读阅读页。 */
  basePath?: "/m/notes" | "/m/wikis";
  showCreate?: boolean;
};

/**
 * `/m/notes/[baseId]` 与 `/m/wikis/[baseId]`：某个知识库下的笔记列表。
 *
 * 翻页复用桌面同一个 `useNotesQuery`（它是按页取、不是无限滚动），
 * 所以这里也是"换页"而不是"累积追加"——把按钮写成"加载更多"会与实际行为不符。
 * 翻页控件做成整行 44px，比桌面那对小按钮好点。
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
  const title = base.data?.knowledgeBaseName ?? "知识库";

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
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      <div className="space-y-4 p-4" data-testid="mobile-note-list">
        {notes.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : notes.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            笔记加载失败：{notes.error.message}
          </p>
        ) : notes.data.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <NotebookPen className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">这个知识库还没有笔记</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {showCreate ? "新建一篇，开始记录。" : "等有人往这个库里写点什么再来看看。"}
            </p>
          </div>
        ) : (
          <>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {notes.data.rows.map((note) => (
                <li key={note.id}>
                  <Link
                    href={`${basePath}/${baseId}/${note.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-2 text-sm outline-none focus-visible:bg-accent"
                  >
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{note.title ?? "未命名笔记"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {note.updateTime
                          ? `更新于 ${note.updateTime.slice(0, 16).replace("T", " ")}`
                          : "暂无更新记录"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <div className="flex items-center gap-2" data-testid="mobile-note-pager">
                <Button
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={page <= 1 || notes.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </Button>
                <span className="shrink-0 text-xs text-muted-foreground">
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
    </MobileScreen>
  );
}
