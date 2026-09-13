"use client";

import { TiptapEditor, type TiptapEditorProps } from "@/components/editor/TiptapEditor";
import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import type { AiContinueFn } from "@/components/editor/presets/types";
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
import { useNoteTitle } from "@/features/notes/use-note-title";
import { useNotesQuery } from "@/features/notes/use-notes";
import { useSaveNote } from "@/features/notes/use-save-note";
import { continueWriting } from "@/lib/ai/sse";
import { MoreHorizontal, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * 编辑区高度 = 视口 − (AppHeader + 内容区上下内边距)。
 * 与 `/ai/chat`、`/ai/pdf`、`/ai/workflow` 用的是同一个常量，改这里记得一起改。
 */
const WORKSPACE_VIEWPORT = "h-[calc(100svh-9rem)]";

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

  const { title, setTitle, onEditorReady, getTitleForContent } = useNoteTitle();
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
  }, [note.data, noteId, setTitle]);

  const handleContentChange = useCallback<NonNullable<TiptapEditorProps["onChange"]>>(
    (markdown, editor) => {
      contentRef.current = markdown;
      scheduleSave({ title: getTitleForContent(editor), content: markdown });
    },
    [scheduleSave, getTitleForContent],
  );

  const handleTitleChange = useCallback(
    (next: string) => {
      setTitle(next);
      scheduleSave({ title: next, content: contentRef.current });
    },
    [scheduleSave, setTitle],
  );

  // 图片走 file 服务的分片直传。实现（SHA-256 + 分片签名）只在真的插图时才下载，
  // 静态 import 会把它压进笔记路由的首屏 JS；引用须稳定，否则每次渲染都会重建编辑器实例
  const uploadFn = useMemo<UploadFn>(
    () => async (file, options) => {
      const { createNoteImageUploader } = await import("@/lib/editor/upload");
      return createNoteImageUploader(noteId, options?.onProgress)(file);
    },
    [noteId],
  );

  // Slash 菜单「AI 续写」：流式增量写回编辑器里的 aiBlock 节点（引用须稳定，否则编辑器会重建）
  const handleAiContinue = useCallback<AiContinueFn>(
    async ({ contextTail, signal, onDelta, onError }) => {
      try {
        await continueWriting({ contextTail, signal, onDelta });
      } catch (error) {
        onError?.(error);
      }
    },
    [],
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
    <div className={`mx-auto flex w-full min-h-0 max-w-7xl gap-6 ${WORKSPACE_VIEWPORT}`}>
      <aside className="hidden w-64 shrink-0 lg:block">
        <ScrollArea className="h-full pr-2">
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

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
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
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <Skeleton className="h-10 w-1/2 shrink-0" />
            <Skeleton className="min-h-0 flex-1 rounded-xl" />
          </div>
        ) : (
          <>
            <Input
              aria-label="笔记标题"
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="未命名笔记"
              className="h-auto shrink-0 border-0 px-0 !text-2xl font-semibold shadow-none focus-visible:ring-0"
            />
            <TiptapEditor
              key={noteId}
              preset="full"
              value={initialContent}
              onChange={handleContentChange}
              onReady={onEditorReady}
              aiContinue={handleAiContinue}
              uploadFn={uploadFn}
              fill
              className="min-h-0 flex-1"
            />
          </>
        )}
      </section>

      <ConflictDialog conflict={conflict} onResolve={(choice) => void resolveConflict(choice)} />
    </div>
  );
}
