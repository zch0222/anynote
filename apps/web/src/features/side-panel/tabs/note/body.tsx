"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { noteHistoryHref } from "@/components/layout/navigation";
import { EditorSkeleton } from "@/components/loading/skeletons";
import { ConflictDialog } from "@/components/note/conflict-dialog";
import { CollabSyncBadge, SaveFailureNotice, SaveStatusBadge } from "@/components/note/save-status";
import { CollabNotices } from "@/features/notes/components/collab-notices";
import { CollabPresence } from "@/features/notes/components/collab-presence";
import { MobileNoteEditorBody } from "@/features/notes/components/mobile/note-editor-mobile-body";
import { useNoteEditorSession } from "@/features/notes/use-note-editor-session";
import { mobileNoteHistoryHref } from "@/lib/mobile/hrefs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { TabHeader } from "../../desktop/tab-header";
import { RESOURCE_TYPE_LABEL } from "../../resource-labels";
import type { TabBodyProps } from "../../types";
import {
  ResourceError,
  ResourceUnavailable,
  isResourceUnavailable,
  resourceMeta,
  tabHref,
} from "../shared";

/**
 * 笔记正文：复用完整页面的保存、冲突与协同语义，侧栏里可直接编辑。
 *
 * @param props 标签记录、导航、端与动作
 * @author 称霸幼儿园
 */
export function NoteTabBody({ record, navigation, variant, actions }: TabBodyProps) {
  const router = useRouter();
  const ref = record.family === "resource" && record.ref.type === "note" ? record.ref : null;
  const locate = useMemo(
    () => ({
      section: navigation.locator.section,
      line: navigation.locator.line,
      revision: navigation.revision,
    }),
    [navigation.locator.section, navigation.locator.line, navigation.revision],
  );
  const session = useNoteEditorSession(ref?.id ?? 0, { locate, syncOnVisible: true });
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const { confirmLeave } = session;

  useEffect(() => actions.registerGuard(confirmLeave), [actions, confirmLeave]);

  const openInNewWindow = useCallback((href: string) => {
    const current = sessionRef.current;
    if (!current.save.hasPendingChanges()) {
      window.open(href, "_blank", "noopener");
      return;
    }
    const win = window.open("about:blank", "_blank");
    if (!win) return;
    void current.save
      .flush()
      .then(() => {
        if (!current.confirmLeave()) {
          win.close();
          return;
        }
        win.opener = null;
        win.location.replace(href);
      })
      .catch(() => {
        win.close();
      });
  }, []);

  useEffect(() => actions.registerNewWindow(openInNewWindow), [actions, openInNewWindow]);

  const href = tabHref(record, navigation.locator, variant);
  const historyHref =
    ref && variant === "mobile"
      ? mobileNoteHistoryHref(ref.kbId, ref.id)
      : ref
        ? noteHistoryHref(ref.kbId, ref.id)
        : null;
  const note = session.note;
  const title = session.title || note.data?.title?.trim() || RESOURCE_TYPE_LABEL.note;
  const pending = session.save.hasPendingChanges();

  if (!ref) return <ResourceUnavailable />;
  if (note.isError) {
    return isResourceUnavailable(note.error) ? (
      <ResourceUnavailable />
    ) : (
      <div className="p-4">
        <ResourceError onRetry={() => void note.refetch()} retrying={note.isFetching} />
      </div>
    );
  }

  if (variant === "mobile") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <MobileNoteEditorBody noteId={ref.id} session={session} showStatus />
      </div>
    );
  }

  if (note.isPending || session.initialContent === null) {
    return (
      <div className="p-4">
        <EditorSkeleton />
      </div>
    );
  }

  const { save, collab, collaboration, serverPersist } = session;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabHeader
        title={title}
        meta={resourceMeta(note.data?.knowledgeBaseName, RESOURCE_TYPE_LABEL.note)}
        status={
          <>
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
                status={save.status}
                lastSavedAt={save.lastSavedAt}
                failure={save.failure}
                collabConnected={collaboration !== undefined && collab.connected}
              />
            )}
            {collaboration ? <CollabPresence peers={collab.peers} /> : null}
          </>
        }
        href={href}
        {...(pending && href ? { onNewWindow: () => openInNewWindow(href) } : {})}
        {...(href ? { onOpenFullPage: () => router.push(href) } : {})}
        {...(historyHref ? { onOpenHistory: () => openInNewWindow(historyHref) } : {})}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {session.collabEnabled && !collab.degraded && !collab.contentReady ? (
          <output
            data-testid="collab-connecting"
            className="mb-3 block rounded-lg border border-separator bg-fill-tertiary px-3 py-2 text-xs text-label-secondary"
          >
            正在接入协同会话，正文载入后即可编辑…
          </output>
        ) : null}
        <CollabNotices collab={collab} className="mb-3" />
        {save.status === "failed" && save.failure ? (
          <SaveFailureNotice
            failure={save.failure}
            onRetry={() => void save.retry()}
            className="mb-3"
          />
        ) : null}
        {session.collabEnabled && collab.degraded ? (
          <div
            role="alert"
            data-testid="collab-degraded"
            className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning"
          >
            <p className="min-w-0 flex-1">协同服务连不上，已切换为单人编辑。你的改动仍会保存。</p>
            <button
              type="button"
              className="shrink-0 font-medium underline"
              onClick={collab.reconnect}
            >
              重新连接
            </button>
          </div>
        ) : null}
        <TiptapEditor
          key={ref.id}
          preset={collaboration ? "collaborative" : "full"}
          value={session.initialContent ?? ""}
          {...(collaboration ? { collaboration } : {})}
          editable={collab.editable}
          onChange={session.handleContentChange}
          onReady={session.handleEditorReady}
          uploadFn={session.uploadFn}
          toolbar="none"
          flush
          className="mt-2"
        />
      </div>
      <ConflictDialog
        conflict={save.conflict}
        onResolve={(choice) => void save.resolveConflict(choice)}
      />
    </div>
  );
}
