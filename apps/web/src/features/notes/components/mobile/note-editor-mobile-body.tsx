"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { EditorSkeleton } from "@/components/loading/skeletons";
import { ConflictDialog } from "@/components/note/conflict-dialog";
import { CollabSyncBadge, SaveFailureNotice, SaveStatusBadge } from "@/components/note/save-status";
import { CollabNotices } from "@/features/notes/components/collab-notices";
import { CollabPresence } from "@/features/notes/components/collab-presence";
import type { NoteEditorSession } from "@/features/notes/use-note-editor-session";
import { formatRelativeTime } from "@/lib/format-time";

/**
 * 移动端笔记正文层：元信息、协同提示与编辑器，不含 MobileScreen 外壳。
 *
 * @param props 笔记 id、会话与是否显示保存状态
 * @author 称霸幼儿园
 */
export function MobileNoteEditorBody({
  noteId,
  session,
  showStatus = false,
}: {
  noteId: number;
  session: NoteEditorSession;
  showStatus?: boolean;
}) {
  const {
    note,
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
  } = session;
  const { resolveConflict, retry, status, lastSavedAt, conflict, failure } = save;

  if (note.isError) {
    return (
      <p className="m-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        笔记加载失败：{note.error.message}
      </p>
    );
  }

  if (note.isPending || initialContent === null) {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <EditorSkeleton className="min-h-0 flex-1" />
      </div>
    );
  }

  return (
    <>
      {showStatus ? (
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
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
        </div>
      ) : null}
      <p
        data-testid="mobile-note-meta"
        className="shrink-0 border-b px-4 pb-3 text-footnote text-label-tertiary"
      >
        {note.data?.updateTime ? `${formatRelativeTime(note.data.updateTime)}更新 · ` : ""}
        <span className="tabular">{charCount.toLocaleString("zh-CN")} 字</span>
        {note.data?.knowledgeBaseName ? ` · ${note.data.knowledgeBaseName}` : ""}
      </p>
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
        <SaveFailureNotice failure={failure} onRetry={() => void retry()} className="mx-4 mt-3" />
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
        editable={collab.editable}
        onChange={handleContentChange}
        onReady={handleEditorReady}
        uploadFn={uploadFn}
        fill
        className="min-h-0 flex-1"
      />
      <ConflictDialog conflict={conflict} onResolve={(choice) => void resolveConflict(choice)} />
    </>
  );
}
