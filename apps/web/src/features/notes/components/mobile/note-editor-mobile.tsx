"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type { AiContinueFn } from "@/components/editor/presets/types";
import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { EditorSkeleton } from "@/components/loading/skeletons";
import { ConflictDialog } from "@/components/note/conflict-dialog";
import { CollabSyncBadge, SaveFailureNotice, SaveStatusBadge } from "@/components/note/save-status";
import { CollabNotices } from "@/features/notes/components/collab-notices";
import { CollabPresence } from "@/features/notes/components/collab-presence";
import { useDeleteNoteMutation } from "@/features/notes/use-delete-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useMoveNoteMutation } from "@/features/notes/use-move-note";
import { useNoteEditorSession } from "@/features/notes/use-note-editor-session";
import { continueWriting } from "@/lib/ai/sse";
import { formatRelativeTime } from "@/lib/format-time";
import { mobileNoteHistoryHref } from "@/lib/mobile/hrefs";
import { FolderInput, History, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

/**
 * `/m/notes/[baseId]/[noteId]`：移动端笔记编辑器。
 *
 * 详情加载、协同运行时与自动保存的接线与桌面共用 `useNoteEditorSession`，差别只在布局：
 *
 * 1. 没有目录树，返回键代替
 * 2. `toolbar="mobile"`：单行横滑 + 贴底（靠近软键盘），气泡菜单关掉
 * 3. 保存状态显示在顶栏，不占正文空间
 * 4. "移动到…"与删除走底部动作表
 */
export function MobileNoteEditor({ baseId, noteId }: { baseId: number; noteId: number }) {
  const router = useRouter();
  const bases = useKnowledgeBasesQuery();
  const remove = useDeleteNoteMutation();
  const move = useMoveNoteMutation();
  const [actionsOpen, setActionsOpen] = useState(false);
  const session = useNoteEditorSession(noteId);
  const {
    note,
    title,
    initialContent,
    charCount,
    collabEnabled,
    collab,
    collaboration,
    serverPersist,
    save,
    handleContentChange,
    handleEditorReady,
    uploadFn,
    confirmLeave,
  } = session;
  const { flush, resolveConflict, retry, status, lastSavedAt, conflict, failure } = save;

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
        if (!confirmLeave()) return;
        await move.mutateAsync({ noteId, knowledgeBaseId: targetBaseId });
        toast.success("笔记已移动");
        router.push(`/m/notes/${targetBaseId}/${noteId}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "移动失败，请稍后重试");
      }
    },
    [confirmLeave, flush, move, noteId, router],
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
    // 落盘后仍没存上（离线、失败、冲突）时先确认，免得跳走丢掉改动
    if (!confirmLeave()) return;
    router.push(mobileNoteHistoryHref(baseId, noteId));
  }, [baseId, confirmLeave, flush, noteId, router]);

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
      title={
        /*
         * 协同态徽标与在线成员条（方案 §7.2 / §7.4）。移动端与桌面走同一套语义：
         * 连上房间时「已保存」改说「已同步」——本地 lastSavedAt 与本房间是否同步无关，
         * 停在「已保存 12 分钟前」会让用户以为内容没同步。在线成员条让「房间里还有谁」
         * 在移动端同样可见，否则多人共编时用户看不到任何同伴反馈。
         */
        <span className="flex min-w-0 items-center gap-2">
          {serverPersist ? (
            <CollabSyncBadge
              status={collab.syncStatus}
              editedWhileOffline={collab.editedWhileOffline}
              hasLocalPersistence={collab.hasLocalPersistence}
              serverEditorVersion={
                collab.fatal?.kind === "outdated" ? collab.fatal.serverVersion : null
              }
            />
          ) : (
            <SaveStatusBadge
              status={status}
              lastSavedAt={lastSavedAt}
              failure={failure}
              collabConnected={collaboration !== undefined && collab.connected}
            />
          )}
          {collaboration ? <CollabPresence peers={collab.peers} /> : null}
        </span>
      }
      back={`/m/notes/${baseId}`}
      confirmLeave={confirmLeave}
      tone="paper"
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
            <span className="tabular">{charCount.toLocaleString("zh-CN")} 字</span>
            {note.data?.knowledgeBaseName ? ` · ${note.data.knowledgeBaseName}` : ""}
          </p>
          {/* 断线降级（§7.4）：协同连不上时提示并回退单人模式 */}
          {/* 连接中 / 正文未就位：编辑器只读，不给提示用户只会觉得"打不出字" */}
          {collabEnabled && !collab.degraded && !collab.contentReady ? (
            <output
              data-testid="collab-connecting"
              className="mx-4 mt-3 block rounded-xl border border-separator bg-fill-tertiary px-4 py-3 text-sm text-label-secondary"
            >
              正在接入协同会话，正文载入后即可编辑…
            </output>
          ) : null}
          <CollabNotices collab={collab} className="mx-4 mt-3" />
          {status === "failed" && failure ? (
            <SaveFailureNotice
              failure={failure}
              onRetry={() => void retry()}
              className="mx-4 mt-3"
            />
          ) : null}
          {collabEnabled && collab.degraded ? (
            <div
              role="alert"
              data-testid="collab-degraded"
              className="mx-4 mb-2 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-footnote text-warning"
            >
              <span className="min-w-0 flex-1">协同服务连不上，已切换为单人编辑。</span>
              <button
                type="button"
                className="shrink-0 font-medium underline"
                onClick={collab.reconnect}
              >
                重连
              </button>
            </div>
          ) : null}
          <TiptapEditor
            key={noteId}
            preset={collaboration ? "collaborative" : "full"}
            toolbar="mobile"
            value={initialContent ?? ""}
            {...(collaboration ? { collaboration } : {})}
            /* 与桌面同一条约束：正文未就位时只读，否则对着空白编辑器打字会覆盖库里的正文 */
            editable={collab.editable}
            onChange={handleContentChange}
            onReady={handleEditorReady}
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
