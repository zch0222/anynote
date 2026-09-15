"use client";

import { TiptapEditor, type TiptapEditorProps } from "@/components/editor/TiptapEditor";
import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import type { AiContinueFn } from "@/components/editor/presets/types";
import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { EditorSkeleton } from "@/components/loading/skeletons";
import { ConflictDialog } from "@/components/note/conflict-dialog";
import { SaveStatusBadge } from "@/components/note/save-status";
import { ensureLeadingHeading, stripLeadingHeading } from "@/features/notes/lib/leading-heading";
import { toVersion } from "@/features/notes/schemas";
import { useDeleteNoteMutation } from "@/features/notes/use-delete-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useMoveNoteMutation } from "@/features/notes/use-move-note";
import { useNoteQuery } from "@/features/notes/use-note";
import { useNoteTitle } from "@/features/notes/use-note-title";
import { useSaveNote } from "@/features/notes/use-save-note";
import { continueWriting } from "@/lib/ai/sse";
import { formatRelativeTime } from "@/lib/format-time";
import { mobileNoteHistoryHref } from "@/lib/mobile/hrefs";
import { FolderInput, History, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * `/m/notes/[baseId]/[noteId]`：移动端笔记编辑器（方案 D5）。
 *
 * 复用桌面的全部逻辑，一行不改：`useNoteQuery` / `useSaveNote`（自动保存 + 冲突）/
 * `useMoveNote` / `lib/editor/upload`。差别只有四点：
 *
 * 1. 没有目录树——它在手机上放不下，返回键代替
 * 2. `toolbar="mobile"`：单行横滑 + 贴底（靠近软键盘），气泡菜单关掉
 * 3. 保存状态显示在顶栏，不占正文空间
 * 4. "移动到…"与删除走底部动作表，不用 hover 才出现的下拉菜单
 *
 * 与桌面一致：**没有独立的标题输入行**，标题就是正文的第一个 H1
 * （见 `note-editor.tsx` 的说明与 `lib/leading-heading.ts`）。
 */
export function MobileNoteEditor({ baseId, noteId }: { baseId: number; noteId: number }) {
  const router = useRouter();
  const note = useNoteQuery(noteId);
  const bases = useKnowledgeBasesQuery();
  const remove = useDeleteNoteMutation();
  const move = useMoveNoteMutation();
  const [actionsOpen, setActionsOpen] = useState(false);

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
    // 与桌面同一处补齐：标题是正文的首节点 H1，老笔记要先补上才看得见
    const content = ensureLeadingHeading(note.data.content ?? "", note.data.title);
    contentRef.current = content;
    setInitialContent(content);
  }, [note.data, noteId, setTitle]);

  const handleContentChange = useCallback<NonNullable<TiptapEditorProps["onChange"]>>(
    (markdown, editor) => {
      contentRef.current = markdown;
      scheduleSave({ title: getTitleForContent(editor), content: markdown });
    },
    [scheduleSave, getTitleForContent],
  );

  // 图片走 file 服务的分片直传；实现只在真的插图时才下载（静态 import 会压进首屏）。
  // 引用须稳定，否则每次渲染都会重建编辑器实例。
  const uploadFn = useMemo<UploadFn>(
    () => async (file, options) => {
      const { createNoteImageUploader } = await import("@/lib/editor/upload");
      return createNoteImageUploader(noteId, options?.onProgress)(file);
    },
    [noteId],
  );

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

  const handleMove = useCallback(
    async (targetBaseId: number) => {
      try {
        // 移动前先把未保存的正文落盘，否则跳转后这段改动就丢了
        await flush();
        await move.mutateAsync({ noteId, knowledgeBaseId: targetBaseId });
        toast.success("笔记已移动");
        router.push(`/m/notes/${targetBaseId}/${noteId}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "移动失败，请稍后重试");
      }
    },
    [flush, move, noteId, router],
  );

  /**
   * 进历史版本页前先 `flush()`。
   *
   * 自动保存是防抖的：刚敲下的那几秒还在本地。不先落盘，历史列表里就看不到
   * 这次改动，而用户点「历史版本」的动机十有八九正是"我刚改了什么"。
   */
  const handleHistory = useCallback(async () => {
    try {
      await flush();
    } catch {
      // flush 失败不拦住跳转：历史页自己能拉到服务端的最新列表，
      // 用户看到的是"这次改动还没进版本"，比一个跳不过去的按钮强
    }
    router.push(mobileNoteHistoryHref(baseId, noteId));
  }, [baseId, flush, noteId, router]);

  const handleDelete = useCallback(async () => {
    try {
      await remove.mutateAsync(noteId);
      toast.success("笔记已删除");
      router.push(`/m/notes/${baseId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  }, [baseId, noteId, remove, router]);

  if (note.isError) {
    return (
      <MobileScreen title="笔记" back={`/m/notes/${baseId}`}>
        <p className="m-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          笔记加载失败：{note.error.message}
        </p>
      </MobileScreen>
    );
  }

  const moveActions = (bases.data ?? [])
    .filter((base) => base.id !== baseId)
    .map((base) => ({
      label: `移动到「${base.knowledgeBaseName ?? "未命名知识库"}」`,
      icon: FolderInput,
      onSelect: () => void handleMove(base.id),
    }));

  return (
    <MobileScreen
      title={<SaveStatusBadge status={status} lastSavedAt={lastSavedAt} />}
      back={`/m/notes/${baseId}`}
      actions={
        <MobileActionSheet
          open={actionsOpen}
          onOpenChange={setActionsOpen}
          title={title || "未命名笔记"}
          description="查看历史版本、移动到别的知识库，或删除这篇笔记。"
          actions={[
            // M-13 图例 1：「历史版本」是动作表**第一项**
            { label: "历史版本", icon: History, onSelect: () => void handleHistory() },
            ...moveActions,
            {
              label: "删除笔记",
              icon: Trash2,
              destructive: true,
              confirm: "再点一次确认删除",
              onSelect: () => void handleDelete(),
            },
          ]}
          trigger={
            <button
              type="button"
              aria-label="笔记操作"
              data-testid="mobile-note-actions"
              className="flex size-10 items-center justify-center rounded-lg text-label-secondary outline-none hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </button>
          }
        />
      }
      fill
      contentClassName="min-h-0"
    >
      {note.isPending || initialContent === null ? (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <EditorSkeleton className="min-h-0 flex-1" />
        </div>
      ) : (
        <>
          {/*
            元信息行（设计稿 p09）：更新 · 字数 · 所属知识库。
            作者与阅读次数后端没有返回（`GET /notes/{id}` 只有 title/content/
            knowledgeBaseId/updateTime），所以只渲染拿得到的几项。
            位置在正文之上——正文的首节点就是 H1 标题，这一行插不进去了。
          */}
          <p
            data-testid="mobile-note-meta"
            className="shrink-0 border-b px-4 pb-3 text-footnote text-label-tertiary"
          >
            {note.data?.updateTime ? `${formatRelativeTime(note.data.updateTime)}更新 · ` : ""}
            <span className="tabular">
              {stripLeadingHeading(initialContent).length.toLocaleString("zh-CN")} 字
            </span>
            {note.data?.knowledgeBaseName ? ` · ${note.data.knowledgeBaseName}` : ""}
          </p>
          <TiptapEditor
            key={noteId}
            preset="full"
            toolbar="mobile"
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

      <ConflictDialog conflict={conflict} onResolve={(choice) => void resolveConflict(choice)} />
    </MobileScreen>
  );
}
