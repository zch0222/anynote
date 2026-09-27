"use client";

import type { TiptapEditorProps } from "@/components/editor/TiptapEditor";
import type { UploadFn } from "@/components/editor/extensions/anynote-image";
import type { CollaborationBinding } from "@/components/editor/presets/types";
import { useCollabNote } from "@/features/collab/use-collab-note";
import { markLeaveConfirmed } from "@/features/notes/leave-confirmation";
import { noteQueryKeys } from "@/features/notes/query-keys";
import { type NoteDetail, toVersion } from "@/features/notes/schemas";
import { useLeaveGuard } from "@/features/notes/use-leave-guard";
import { useNoteQuery } from "@/features/notes/use-note";
import { useNoteTitle } from "@/features/notes/use-note-title";
import type { NotePage } from "@/features/notes/use-notes";
import {
  COLLAB_AUTOSAVE_DEBOUNCE_MS,
  type NoteDraft,
  UNSAVED_LEAVE_MESSAGE,
  hasUnsavedRisk,
  useSaveNote,
} from "@/features/notes/use-save-note";
import { env } from "@/lib/env";
import { bodyCharCount, ensureLeadingHeading } from "@anynote/editor-core/leading-heading";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 可写笔记所需的最低权限（`NotePermissions.EDIT`）。低于它不进协同房间。 */
export const EDIT_PERMISSION = 6;

/**
 * 笔记编辑页的会话：详情加载、标题、字数、协同运行时、自动保存与编辑器回调。
 *
 * 桌面端与移动端共用这一份接线，两端只负责各自的布局与操作入口。
 *
 * @param noteId 当前笔记 id
 */
export function useNoteEditorSession(noteId: number) {
  const note = useNoteQuery(noteId);
  const { title, setTitle, onEditorReady, getTitleForContent } = useNoteTitle();
  /** 编辑器的初始正文，只在切换笔记或放弃本地改动时重置。 */
  const [initialContent, setInitialContent] = useState<string | null>(null);
  /** 正文字数（不含顶部 H1），随每次正文变化更新。 */
  const [charCount, setCharCount] = useState(0);
  const loadedNoteId = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);

  /** 协同开关打开且当前用户对该笔记有编辑权时进入协同模式。 */
  const collabEnabled =
    env.NEXT_PUBLIC_COLLAB_NOTES && (note.data?.notePermissions ?? 0) >= EDIT_PERMISSION;

  /** 下一次 `onChange` 来自本地编辑的标记（v2.0 协同的客户端保存链路使用）。 */
  const localEditRef = useRef(false);
  const collab = useCollabNote({
    noteId,
    enabled: collabEnabled,
    editor: editorInstance,
    markdown: initialContent,
    onLocalEdit: () => {
      localEditRef.current = true;
    },
  });

  /** 冲突时选择放弃本地改动：编辑器、标题与字数一起切到服务端内容。 */
  const handleDiscardLocal = useCallback(
    (server: NoteDraft) => {
      const content = ensureLeadingHeading(server.content, server.title);
      setTitle(server.title);
      setInitialContent(content);
      setCharCount(bodyCharCount(content));
      const editor = editorRef.current;
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(content, { emitUpdate: false });
        onEditorReady(editor);
      }
    },
    [onEditorReady, setTitle],
  );

  const save = useSaveNote({
    noteId,
    initialVersion: toVersion(note.data?.updateTime),
    conflictPolicy: collab.active ? "overwrite" : "prompt",
    debounceMs: collab.active ? COLLAB_AUTOSAVE_DEBOUNCE_MS : undefined,
    sharedVersion: collab.savedVersion,
    onSaved: collab.publishSavedVersion,
    onDiscardLocal: handleDiscardLocal,
  });
  const { scheduleSave } = save;

  useEffect(() => {
    if (!note.data || loadedNoteId.current === noteId) return;
    loadedNoteId.current = noteId;
    setTitle(note.data.title ?? "");
    // 老笔记正文里没有顶部 H1，打开时用已存标题补上，不单独发写请求
    const content = ensureLeadingHeading(note.data.content ?? "", note.data.title);
    setInitialContent(content);
    setCharCount(bodyCharCount(content));
  }, [note.data, noteId, setTitle]);

  /** 服务端落库时由协同服务写库，编辑页不再发保存请求。 */
  const serverPersist = collabEnabled && collab.serverPersist;

  /**
   * 离开拦截：服务端落库时看同步状态；其余情况（单人、客户端保存的协同、协同降级）
   * 看保存状态，离线、失败或冲突时拦截站内链接与关页。
   */
  const leaveGuard = serverPersist
    ? collab.leaveGuard
    : { active: hasUnsavedRisk(save.status), message: UNSAVED_LEAVE_MESSAGE };
  useLeaveGuard(leaveGuard.active, leaveGuard.message);

  const collabLeaveGuardRef = useRef(collab.leaveGuard);
  collabLeaveGuardRef.current = collab.leaveGuard;
  const { getStatus } = save;
  /**
   * 按钮触发的站内跳转（返回键、历史版本、移动笔记）前调用：有丢失风险时弹确认。
   * 保存状态现取而不用渲染时的值，`flush()` 之后调用也能读到这次落盘的结果。
   *
   * @returns 是否可以离开
   */
  const confirmLeave = useCallback(() => {
    const guard = serverPersist
      ? collabLeaveGuardRef.current
      : { active: hasUnsavedRisk(getStatus()), message: UNSAVED_LEAVE_MESSAGE };
    if (!guard.active) return true;
    if (!window.confirm(guard.message)) return false;
    markLeaveConfirmed();
    return true;
  }, [serverPersist, getStatus]);

  const queryClient = useQueryClient();
  const titleRef = useRef(title);
  titleRef.current = title;

  /**
   * 服务端落库时，标题随顶部 H1 立即写进列表与详情缓存，不等写库：
   * 写库在最后一人离开时才发生，离开编辑页立刻回到列表也能看到新标题。
   */
  const liveTitle = serverPersist ? title : "";
  useEffect(() => {
    if (!liveTitle) return;
    patchCachedTitle(queryClient, noteId, liveTitle);
  }, [liveTitle, noteId, queryClient]);

  const storedNotice = serverPersist ? collab.stored : null;
  /**
   * 协同服务写库成功：详情缓存换上新版本号并标记过期（下次打开重新拉正文），
   * 通知里的标题与本地一致时重新拉取笔记列表，刷新目录里的更新时间。
   * 标题落后于本地（写库之后又改过 H1）时不拉取，等下一次写库，免得目录标题倒退。
   */
  useEffect(() => {
    if (!storedNotice) return;
    const detailKey = noteQueryKeys.detail(noteId);
    const updateTime = new Date(Number(storedNotice.version)).toISOString();
    queryClient.setQueryData<NoteDetail>(detailKey, (current) =>
      current ? { ...current, updateTime } : current,
    );
    void queryClient.invalidateQueries({ queryKey: detailKey, refetchType: "none" });
    if (storedNotice.title === null || storedNotice.title === titleRef.current) {
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists });
    }
  }, [storedNotice, noteId, queryClient]);

  const handleContentChange = useCallback<NonNullable<TiptapEditorProps["onChange"]>>(
    (markdown, editor) => {
      setCharCount(bodyCharCount(markdown));
      if (serverPersist) {
        // 标题基线仍随正文推进，界面上的标题（移动端动作表）跟着顶部 H1 变化
        getTitleForContent(editor);
        localEditRef.current = false;
        return;
      }
      // 没有可用的协同会话（开关关闭、只读或协同降级）时走单人保存链路
      if (!collabEnabled || !collab.active) {
        scheduleSave({ title: getTitleForContent(editor), content: markdown });
        return;
      }
      // 协同模式只保存本地编辑；远端广播不带本地编辑标记
      if (!localEditRef.current) return;
      localEditRef.current = false;
      scheduleSave({ title: getTitleForContent(editor), content: markdown });
    },
    [scheduleSave, getTitleForContent, collabEnabled, collab.active, serverPersist],
  );

  /**
   * 协同绑定；引用须稳定，否则每次渲染都会重建编辑器实例。
   *
   * 服务端落库时，正文就位（本地副本载入或首次同步完成）之前不绑定：
   * 这段时间编辑器只读显示 REST 拿到的正文，而不是空白的 Y 文档。
   */
  const bindingReady = collab.active && (!collab.serverPersist || collab.contentReady);
  const collaboration: CollaborationBinding | undefined = useMemo(() => {
    if (!bindingReady || !collab.doc || !collab.provider || !collab.user) return undefined;
    return {
      doc: collab.doc,
      provider: collab.provider,
      user: { name: collab.user.name, color: collab.user.color },
    };
  }, [bindingReady, collab.doc, collab.provider, collab.user]);

  /**
   * 编辑器就绪：建立标题基线，并在协同绑定就绪后把实例交给协同运行时。
   * 绑定就绪前的实例跑的是单人预设，不能交给协同运行时。
   */
  const handleEditorReady = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      onEditorReady(editor);
      setEditorInstance(collaboration ? editor : null);
    },
    [onEditorReady, collaboration],
  );

  /** 图片分片直传；实现只在真的插图时才加载。引用须稳定。 */
  const uploadFn = useMemo<UploadFn>(
    () => async (file, options) => {
      const { createNoteImageUploader } = await import("@/lib/editor/upload");
      return createNoteImageUploader(noteId, options?.onProgress)(file);
    },
    [noteId],
  );

  return {
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
  };
}

/**
 * 把缓存里这篇笔记的标题换成 `title`。
 * 标题没有变化的缓存原样保留，不刷新它的新鲜度（否则会挡住已标记的过期重拉）。
 */
function patchCachedTitle(queryClient: QueryClient, noteId: number, title: string) {
  queryClient.setQueryData<NoteDetail>(noteQueryKeys.detail(noteId), (current) =>
    current && current.title !== title ? { ...current, title } : undefined,
  );
  queryClient.setQueriesData<NotePage>({ queryKey: noteQueryKeys.lists }, (current) => {
    if (!current?.rows.some((row) => row.id === noteId && row.title !== title)) return undefined;
    return {
      ...current,
      rows: current.rows.map((row) => (row.id === noteId ? { ...row, title } : row)),
    };
  });
}
