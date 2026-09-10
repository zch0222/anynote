"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE } from "@/features/notes/schemas";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { ChevronLeft, ChevronRight, FileText, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateNoteDialog } from "./create-note-dialog";

/** `/notes/[baseId]`：当前知识库下的笔记分页列表。 */
export function NoteList({ baseId }: { baseId: number }) {
  const [page, setPage] = useState(1);
  const base = useKnowledgeBaseQuery(baseId);
  const notes = useNotesQuery({ knowledgeBaseId: baseId, page, pageSize: DEFAULT_PAGE_SIZE });
  const totalPages = notes.data?.pages ?? 1;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <nav aria-label="面包屑" className="text-sm text-muted-foreground">
            <Link href="/notes" className="hover:text-foreground">
              笔记
            </Link>
            <span className="px-1.5">/</span>
            <span className="text-foreground">{base.data?.knowledgeBaseName ?? "知识库"}</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight">
            {base.data?.knowledgeBaseName ?? "知识库"}
          </h1>
          {base.data?.detail ? (
            <p className="text-sm text-muted-foreground">{base.data.detail}</p>
          ) : null}
        </div>
        <CreateNoteDialog knowledgeBaseId={baseId} />
      </div>

      {notes.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : notes.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          笔记加载失败：{notes.error.message}
        </p>
      ) : notes.data.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <NotebookPen className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">这个知识库还没有笔记</p>
          <p className="mt-1 text-sm text-muted-foreground">新建一篇，开始记录。</p>
        </div>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notes.data.rows.map((note) => (
              <li key={note.id}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <Link
                    href={`/notes/${baseId}/${note.id}`}
                    className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <FileText
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">{note.title ?? "未命名笔记"}</span>
                      </CardTitle>
                      <CardDescription>
                        {note.updateTime
                          ? `更新于 ${note.updateTime.slice(0, 16).replace("T", " ")}`
                          : "暂无更新记录"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
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
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
