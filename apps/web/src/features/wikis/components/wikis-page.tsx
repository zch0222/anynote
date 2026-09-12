"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE, type KnowledgeBase } from "@/features/notes/schemas";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useNoteQuery } from "@/features/notes/use-note";
import { useNotesQuery } from "@/features/notes/use-notes";
import { BookOpen, FileText } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * `/wikis`：知识库（wiki）→ 笔记两级导航 + 只读编辑器。
 * 数据与笔记域同一契约（/bases、/notes、/notes/{id}），这里只读浏览。
 */
export function WikisPage() {
  const bases = useKnowledgeBasesQuery();
  const [baseId, setBaseId] = useState<number | null>(null);
  const [noteId, setNoteId] = useState<number | null>(null);

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (baseId === null && firstBase) {
      setBaseId(firstBase.id);
    }
  }, [firstBase, baseId]);

  const notes = useNotesQuery({
    knowledgeBaseId: baseId ?? 0,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  // 知识库切换后默认选中第一篇
  const firstNote = notes.data?.rows[0];
  useEffect(() => {
    if (noteId === null && firstNote) {
      setNoteId(firstNote.id);
    }
  }, [firstNote, noteId]);

  const selectBase = (id: number) => {
    setBaseId(id);
    setNoteId(null);
  };

  const error = bases.isError ? bases.error.message : notes.isError ? notes.error.message : null;

  return (
    <section
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:h-[calc(100svh-9rem)] lg:min-h-0"
      data-testid="wikis-page"
    >
      <div className="shrink-0 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">知识库</h1>
        <p className="text-sm text-muted-foreground">连接知识，构建属于你的知识库。</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          加载失败：{error}
        </p>
      ) : bases.isPending ? (
        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[16rem_1fr] lg:grid-rows-1">
          <Skeleton className="h-96 rounded-xl lg:h-full" />
          <Skeleton className="h-96 rounded-xl lg:h-full" />
        </div>
      ) : (bases.data?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <BookOpen className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">还没有知识库</p>
          <p className="mt-1 text-sm text-muted-foreground">先到「笔记」页创建一个知识库。</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[16rem_1fr] lg:grid-rows-1">
          <div className="space-y-3 lg:min-h-0 lg:overflow-y-auto">
            <nav aria-label="知识库列表" className="space-y-1">
              {bases.data?.map((base) => (
                <BaseRow
                  key={base.id}
                  base={base}
                  active={base.id === baseId}
                  onClick={() => {
                    selectBase(base.id);
                  }}
                />
              ))}
            </nav>
            <nav aria-label="笔记列表" className="space-y-1 border-t pt-3">
              {notes.data?.rows.length === 0 ? (
                <p className="px-2 py-1 text-sm text-muted-foreground">这个知识库下还没有笔记</p>
              ) : (
                notes.data?.rows.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors ${
                      note.id === noteId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                    }`}
                    onClick={() => {
                      setNoteId(note.id);
                    }}
                    data-testid={`wiki-note-${note.id}`}
                  >
                    <FileText
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{note.title ?? "未命名笔记"}</span>
                  </button>
                ))
              )}
            </nav>
          </div>

          <div className="min-h-80 min-w-0 lg:min-h-0">
            {noteId ? (
              <WikiNoteView noteId={noteId} />
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground lg:min-h-0">
                选择左侧笔记开始阅读。
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function BaseRow({
  base,
  active,
  onClick,
}: {
  base: KnowledgeBase;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      }`}
      onClick={onClick}
      data-testid={`wiki-base-${base.id}`}
    >
      <BookOpen className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{base.knowledgeBaseName ?? "未命名知识库"}</span>
    </button>
  );
}

function WikiNoteView({ noteId }: { noteId: number }) {
  const note = useNoteQuery(noteId);

  if (note.isPending) {
    return (
      <div className="h-full space-y-3 overflow-y-auto rounded-xl border p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (note.isError) {
    return (
      <div className="h-full overflow-y-auto rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        笔记加载失败：{note.error.message}
      </div>
    );
  }
  return (
    <article
      className="h-full overflow-y-auto rounded-xl border bg-card p-6"
      data-testid="wiki-note-view"
    >
      <h2 className="mb-4 text-xl font-semibold">{note.data?.title ?? "未命名笔记"}</h2>
      <TiptapEditor preset="readonly" value={note.data?.content ?? ""} />
    </article>
  );
}
