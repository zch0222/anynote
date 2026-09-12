"use client";

import { ApiError, unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { RES_CODE } from "@anynote/api-core/codes";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { noteQueryKeys } from "./query-keys";
import {
  type NoteDetail,
  type NoteSaveResult,
  noteDetailSchema,
  noteSaveResultSchema,
  toVersion,
} from "./schemas";

/** 后端乐观并发冲突的业务码，与 ResCode.RESOURCE_VERSION_CONFLICT 一致。 */
export const VERSION_CONFLICT_CODE = RES_CODE.VERSION_CONFLICT;

export const AUTOSAVE_DEBOUNCE_MS = 1500;
/** 保存失败后的重试间隔；只重试网络/服务端故障，冲突不重试。 */
export const RETRY_DELAY_MS = 5000;

export type NoteDraft = { title: string; content: string };

export type NoteSaveStatus =
  /** 与服务端一致 */
  | "saved"
  /** 有改动在等 debounce */
  | "pending"
  /** 请求进行中 */
  | "saving"
  /** 离线，改动留在本地等重连 */
  | "offline"
  /** 保存失败，等待重试 */
  | "error"
  /** 版本冲突，等用户决定 */
  | "conflict";

export type NoteConflict = {
  local: NoteDraft;
  server: { title: string; content: string; version: string | null; updateTime: string | null };
};

async function patchNote(
  noteId: number,
  body: { title?: string; content?: string; version?: string },
  init?: { keepalive?: boolean },
): Promise<NoteSaveResult> {
  const { response } = await noteApi.PATCH("/notes/{noteId}", {
    params: { path: { noteId } },
    body,
    parseAs: "stream",
    ...(init?.keepalive ? { keepalive: true } : { signal: AbortSignal.timeout(15_000) }),
  });
  return unwrapEnvelope(response, noteSaveResultSchema.parse);
}

async function fetchNote(noteId: number): Promise<NoteDetail> {
  const { response } = await noteApi.GET("/notes/{noteId}", {
    params: { path: { noteId } },
    parseAs: "stream",
    signal: AbortSignal.timeout(15_000),
  });
  return unwrapEnvelope(response, noteDetailSchema.parse);
}

/**
 * 笔记自动保存。
 *
 * - debounce 1.5s 合并连续输入；`flush()` 用于离开页面前立刻落盘。
 * - 乐观更新详情缓存，失败回滚到请求前的快照。
 * - 每次保存都带上服务端返回的 `version`；后端判定过期会回 A0409，
 *   此时不重试，把双方内容交给调用方弹冲突提示。
 * - `navigator.onLine === false` 时不发请求，改动留在本地，`online` 事件恢复后补发。
 */
export function useSaveNote(options: {
  noteId: number;
  initialVersion: string | null;
  debounceMs?: number;
}) {
  const { noteId, initialVersion, debounceMs = AUTOSAVE_DEBOUNCE_MS } = options;
  const queryClient = useQueryClient();
  const detailKey = useMemo(() => noteQueryKeys.detail(noteId), [noteId]);

  const [status, setStatus] = useState<NoteSaveStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [conflict, setConflict] = useState<NoteConflict | null>(null);

  const versionRef = useRef(initialVersion);
  const pendingRef = useRef<NoteDraft | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  // 冲突未解决前不再自动发保存，否则会连续撞同一个 A0409
  const blocked = useRef(false);

  useEffect(() => {
    versionRef.current = initialVersion;
  }, [initialVersion]);

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    debounceTimer.current = null;
    retryTimer.current = null;
  }, []);

  const save = useCallback(async (): Promise<void> => {
    const draft = pendingRef.current;
    if (!draft || inFlight.current || blocked.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setStatus("offline");
      return;
    }

    inFlight.current = true;
    pendingRef.current = null;
    setStatus("saving");

    const snapshot = queryClient.getQueryData<NoteDetail>(detailKey);
    queryClient.setQueryData<NoteDetail>(detailKey, (current) =>
      current ? { ...current, title: draft.title, content: draft.content } : current,
    );

    try {
      const version = versionRef.current;
      const result = await patchNote(noteId, {
        title: draft.title,
        content: draft.content,
        ...(version ? { version } : {}),
      });
      versionRef.current = result.version ?? toVersion(result.updateTime);
      queryClient.setQueryData<NoteDetail>(detailKey, (current) =>
        current
          ? {
              ...current,
              title: result.title ?? draft.title,
              content: result.content ?? draft.content,
              updateTime: result.updateTime ?? current.updateTime,
            }
          : current,
      );
      // 标题与更新时间会改变列表排序，列表整体失效由各页面自己重取
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists });
      setLastSavedAt(new Date());
      setStatus(pendingRef.current ? "pending" : "saved");
    } catch (error) {
      // 回滚乐观更新：失败后缓存必须回到请求前的样子，否则用户看到的是没落盘的内容
      queryClient.setQueryData<NoteDetail>(detailKey, snapshot);
      if (error instanceof ApiError && error.code === VERSION_CONFLICT_CODE) {
        blocked.current = true;
        pendingRef.current = draft;
        setStatus("conflict");
        const server = await fetchNote(noteId).catch(() => null);
        setConflict({
          local: draft,
          server: {
            title: server?.title ?? "",
            content: server?.content ?? "",
            version: toVersion(server?.updateTime),
            updateTime: server?.updateTime ?? null,
          },
        });
        return;
      }
      pendingRef.current = draft;
      setStatus(
        typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error",
      );
    } finally {
      inFlight.current = false;
    }
  }, [detailKey, noteId, queryClient]);

  // 失败后按固定间隔重试，直到成功或用户再次编辑触发新的 debounce
  useEffect(() => {
    if (status !== "error") return;
    retryTimer.current = setTimeout(() => void save(), RETRY_DELAY_MS);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [status, save]);

  const scheduleSave = useCallback(
    (draft: NoteDraft) => {
      pendingRef.current = draft;
      if (blocked.current) return;
      setStatus("pending");
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => void save(), debounceMs);
    },
    [debounceMs, save],
  );

  /** 立刻落盘等待中的改动（离开页面、手动保存）。 */
  const flush = useCallback(async () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = null;
    await save();
  }, [save]);

  /**
   * 页面卸载路径上的保存：普通请求会被中断，只能用 keepalive 让浏览器把它送完，
   * 因此不等待响应，也不更新任何本地状态。
   */
  const flushOnUnload = useCallback(() => {
    const draft = pendingRef.current;
    if (!draft || blocked.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const version = versionRef.current;
    void patchNote(
      noteId,
      { title: draft.title, content: draft.content, ...(version ? { version } : {}) },
      { keepalive: true },
    ).catch(() => undefined);
    pendingRef.current = null;
  }, [noteId]);

  useEffect(() => {
    const handleOnline = () => {
      if (pendingRef.current) void save();
    };
    const handleOffline = () => {
      if (pendingRef.current) setStatus("offline");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("pagehide", flushOnUnload);
    window.addEventListener("beforeunload", flushOnUnload);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("pagehide", flushOnUnload);
      window.removeEventListener("beforeunload", flushOnUnload);
    };
  }, [flushOnUnload, save]);

  // 组件卸载（含 SPA 路由跳转）同样要把未保存的内容送出去
  useEffect(() => {
    return () => {
      clearTimers();
      flushOnUnload();
    };
  }, [clearTimers, flushOnUnload]);

  /** 冲突处理：保留本地内容（用服务端最新版本号覆盖），或放弃本地改动接受服务端内容。 */
  const resolveConflict = useCallback(
    async (choice: "keepLocal" | "useServer") => {
      const current = conflict;
      if (!current) return;
      blocked.current = false;
      setConflict(null);
      if (choice === "useServer") {
        pendingRef.current = null;
        versionRef.current = current.server.version;
        queryClient.setQueryData<NoteDetail>(detailKey, (existing) =>
          existing
            ? {
                ...existing,
                title: current.server.title,
                content: current.server.content,
                updateTime: current.server.updateTime,
              }
            : existing,
        );
        setStatus("saved");
        return;
      }
      versionRef.current = current.server.version;
      pendingRef.current = current.local;
      await save();
    },
    [conflict, detailKey, queryClient, save],
  );

  return {
    status,
    lastSavedAt,
    conflict,
    scheduleSave,
    flush,
    resolveConflict,
    /** 当前是否有未落盘的改动，页面据此决定是否提示。 */
    hasPendingChanges: () => pendingRef.current !== null,
  };
}
