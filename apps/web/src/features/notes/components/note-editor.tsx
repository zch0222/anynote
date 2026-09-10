"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { ConflictDialog } from "@/components/note/conflict-dialog";
import { NoteTree } from "@/components/note/note-tree";
import { SaveStatusBadge } from "@/components/note/save-status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE, toVersion } from "@/features/notes/schemas";
import { useDeleteNoteMutation } from "@/features/notes/use-delete-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useMoveNoteMutation } from "@/features/notes/use-move-note";
import { useNoteQuery } from "@/features/notes/use-note";
import { useNotesQuery } from "@/features/notes/use-notes";
import { useSaveNote } from "@/features/notes/use-save-note";
import { MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * `/notes/[baseId]/[noteId]`：左目录 + 右编辑器。
 *
 * 编辑器是非受控的：只在笔记切换时喂一次初始内容，之后的每次输入都进自动保存队列。
 * 如果把 query 缓存直接当 `value` 回灌，保存返回的内容会把光标顶回文首。
 */
export function NoteEditor({ baseId, noteId }: { baseId: number; noteId: number }) {
  const router = useRouter();
  const note = useNoteQuery(noteId);
  const bases = useKnowledgeBasesQuery();
  const notes = useNotesQuery({ knowledgeBaseId: baseId, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const remove = useDeleteNoteMutation();
  const move = useMoveNoteMutation();

  const [title, setTitle] = useState("");
  // 只在笔记切换时重置一次编辑器初始值，避免自动保存的回写打断输入
  const [initialContent, setInitialContent] = useState<string | null>(null);
  const loadedNoteId = useRef<number | null>(null);
  const contentRef = useRef("");

  const save = useSaveNote({ noteId, initialVersion: toVersion(note.data?.updateTime) });
  const { scheduleSave, flush, resolveConflict, status, lastSavedAt, conflict } = save;

  useEffect(() => {
    if (!note.data || loadedNoteId.current === noteId) return;
    loadedNoteId.current = noteId;
    setTitle(note.data.title ?? "");
    contentRef.current = note.data.content ?? "";
    setInitialContent(note.data.content ?? "");
  }, [note.data, noteId]);

  const handleContentChange = useCallback(
    (markdown: string) => {
      contentRef.current = markdown;
      scheduleSave({ title, content: markdown });
    },
    [scheduleSave, title],
  );

  const handleTitleChange = useCallback(
    (next: string) => {
      setTitle(next);
      scheduleSave({ title: next, content: contentRef.current });
    },
    [scheduleSave],
  );

  async function handleDelete() {
    if (!window.confirm("删除后无法恢复，确认删除这篇笔记？")) return;
    try {
      await remove.mutateAsync(noteId);
      toast.success("笔记已删除");
      router.push(`/notes/${baseId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  }

  const handleMove = useCallback(
    async (input: { noteId: number; knowledgeBaseId: number }) => {
      try {
        // 移动前先把未保存的正文落盘，否则跳转后这段改动就丢了
        await flush();
        await move.mutateAsync(input);
        toast.success("笔记已移动");
        router.push(`/notes/${input.knowledgeBaseId}/${input.noteId}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "移动失败，请稍后重试");
      }
    },
    [flush, move, router],
  );

  if (note.isError) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        笔记加载失败：{note.error.message}
      </p>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6">
      <aside className="hidden w-64 shrink-0 lg:block">
        <ScrollArea className="h-[calc(100vh-9rem)] pr-2">
          <NoteTree
            bases={(bases.data ?? []).map((base) => ({
              id: base.id,
              name: base.knowledgeBaseName ?? "未命名知识库",
            }))}
            activeBaseId={baseId}
            activeNoteId={noteId}
            notes={(notes.data?.rows ?? []).map((item) => ({
              id: item.id,
              title: item.title ?? "未命名笔记",
            }))}
            isLoading={notes.isPending}
            onMoveNote={handleMove}
          />
        </ScrollArea>
      </aside>

      <section className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="面包屑" className="text-sm text-muted-foreground">
            <Link href="/notes" className="hover:text-foreground">
              笔记
            </Link>
            <span className="px-1.5">/</span>
            <Link href={`/notes/${baseId}`} className="hover:text-foreground">
              {note.data?.knowledgeBaseName ?? "知识库"}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <SaveStatusBadge status={status} lastSavedAt={lastSavedAt} />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" />}
                aria-label="笔记操作"
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>移动到知识库</DropdownMenuLabel>
                  {(bases.data ?? [])
                    .filter((base) => base.id !== baseId)
                    .map((base) => (
                      <DropdownMenuItem
                        key={base.id}
                        onClick={() => void handleMove({ noteId, knowledgeBaseId: base.id })}
                      >
                        {base.knowledgeBaseName ?? "未命名知识库"}
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => void handleDelete()}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    删除笔记
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {note.isPending || initialContent === null ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <Input
              aria-label="笔记标题"
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="未命名笔记"
              className="h-auto border-0 px-0 !text-2xl font-semibold shadow-none focus-visible:ring-0"
            />
            <TiptapEditor
              key={noteId}
              preset="full"
              value={initialContent}
              onChange={handleContentChange}
            />
          </>
        )}
      </section>

      <ConflictDialog conflict={conflict} onResolve={(choice) => void resolveConflict(choice)} />
    </div>
  );
}
