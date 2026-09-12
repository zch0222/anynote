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

/** 单次请求的结局：`resync` 表示版本号过期但内容没被别人改，换号重发即可。 */
type SaveOutcome = "done" | "resync";

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

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * 笔记自动保存。
 *
 * - debounce 1.5s 合并连续输入；`flush()` 用于离开页面前立刻落盘。
 * - 乐观更新详情缓存，失败回滚到请求前的快照。
 * - 版本号（`version`）**只由保存响应推进**。它一旦被详情缓存里的 `updateTime` 反向回灌，
 *   任何一次「服务端已改、前端没拿到新版本号」的保存（典型是卸载时的 keepalive flush）
 *   都会让下一次自动保存撞上 A0409。
 * - 收到 A0409 时先回读服务端内容与 `baseRef`（上次已知的服务端内容）比对：
 *   内容一致说明只是版本令牌漂移，换号静默重发；真的被别人改过才弹冲突。
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

  const versionRef = useRef<string | null>(initialVersion);
  /** 上一次确认与服务端一致的内容，用来判断 A0409 是真冲突还是版本令牌漂移。 */
  const baseRef = useRef<NoteDraft | null>(null);
  /** 已经 seed 过版本号的笔记 id；换笔记时重新 seed，同一篇只 seed 一次。 */
  const seededFor = useRef<number | null>(null);
  const pendingRef = useRef<NoteDraft | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  // 冲突未解决前不再自动发保存，否则会连续撞同一个 A0409
  const blocked = useRef(false);
  // 事件回调与定时器要拿到最新的 save，但 save 本身依赖它们，用 ref 打破循环
  const saveRef = useRef<() => Promise<void>>(async () => undefined);

  /**
   * 只在这篇笔记第一次拿到服务端时间戳时 seed 一次版本号与基线内容。
   *
   * 不能持续跟随 `initialVersion`：页面把它算作 `toVersion(note.data.updateTime)`，
   * 而详情缓存的 `updateTime` 在「已保存但前端没拿到新版本号」时是旧的，
   * 跟随它等于把过期令牌固化下来，下一次自动保存必然 A0409。
   */
  useEffect(() => {
    if (seededFor.current === noteId || initialVersion === null) return;
    seededFor.current = noteId;
    versionRef.current = initialVersion;
    const detail = queryClient.getQueryData<NoteDetail>(detailKey);
    baseRef.current = detail ? { title: detail.title ?? "", content: detail.content ?? "" } : null;
  }, [noteId, initialVersion, detailKey, queryClient]);

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    debounceTimer.current = null;
    retryTimer.current = null;
  }, []);

  const armDebounce = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void saveRef.current(), debounceMs);
  }, [debounceMs]);

  /** 发一次保存请求并处理结果。调用方保证同一时刻只有一个在跑。 */
  const runSave = useCallback(async (): Promise<SaveOutcome> => {
    const draft = pendingRef.current;
    if (!draft) return "done";
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
      baseRef.current = {
        title: result.title ?? draft.title,
        content: result.content ?? draft.content,
      };
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
      if (pendingRef.current) {
        // 请求进行中到期的 debounce 会被 inFlight 挡掉，这里补排一次，
        // 否则这批改动要等用户下次敲键盘才有人管
        setStatus("pending");
        armDebounce();
      } else {
        setStatus("saved");
      }
      return "done";
    } catch (error) {
      // 回滚乐观更新：失败后缓存必须回到请求前的样子，否则用户看到的是没落盘的内容
      queryClient.setQueryData<NoteDetail>(detailKey, snapshot);
      // 请求期间可能又敲了字，此时 pendingRef 里是更新的草稿，不能被旧的覆盖
      const local = pendingRef.current ?? draft;
      pendingRef.current = local;

      if (error instanceof ApiError && error.code === VERSION_CONFLICT_CODE) {
        const server = await fetchNote(noteId).catch(() => null);
        const serverDraft = { title: server?.title ?? "", content: server?.content ?? "" };
        const serverVersion = toVersion(server?.updateTime);
        const base = baseRef.current;
        // 服务端内容跟我们已知的基线一样 ⇒ 没人改过这篇笔记，只是我们手里的版本令牌过期了
        // （卸载时的 keepalive flush、超时但其实已生效的重发、同秒保存都会造成这种漂移）。
        if (
          server !== null &&
          serverVersion !== null &&
          base !== null &&
          base.title === serverDraft.title &&
          base.content === serverDraft.content
        ) {
          versionRef.current = serverVersion;
          return "resync";
        }
        blocked.current = true;
        setStatus("conflict");
        setConflict({
          local,
          server: {
            ...serverDraft,
            version: serverVersion,
            updateTime: server?.updateTime ?? null,
          },
        });
        return "done";
      }

      setStatus(isOffline() ? "offline" : "error");
      return "done";
    }
  }, [armDebounce, detailKey, noteId, queryClient]);

  const save = useCallback(async (): Promise<void> => {
    if (inFlight.current || blocked.current || !pendingRef.current) return;
    if (isOffline()) {
      setStatus("offline");
      return;
    }

    inFlight.current = true;
    let outcome: SaveOutcome = "done";
    try {
      // 最多两拍：第一拍撞上版本令牌漂移时换号再发一次，之后不再自动重试，避免死循环
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (!pendingRef.current) break;
        outcome = await runSave();
        if (outcome === "done") break;
      }
    } finally {
      inFlight.current = false;
    }
    if (outcome === "resync") {
      // 换过版本号仍被判过期：交给固定间隔重试，不能停在 saving 态让状态徽标假死
      setStatus("error");
    }
  }, [runSave]);

  saveRef.current = save;

  // 失败后按固定间隔重试，直到成功或用户再次编辑触发新的 debounce
  useEffect(() => {
    if (status !== "error") return;
    retryTimer.current = setTimeout(() => void saveRef.current(), RETRY_DELAY_MS);
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = null;
    };
  }, [status]);

  const scheduleSave = useCallback(
    (draft: NoteDraft) => {
      pendingRef.current = draft;
      if (blocked.current) return;
      setStatus("pending");
      armDebounce();
    },
    [armDebounce],
  );

  /** 立刻落盘等待中的改动（离开页面、手动保存）。 */
  const flush = useCallback(async () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = null;
    await save();
  }, [save]);

  /**
   * 页面卸载路径上的保存：普通请求会被中断，只能用 keepalive 让浏览器把它送完，
   * 因此不等待响应，也拿不到新的版本号。
   *
   * 三项善后必须做，否则「离开 → 回到同一篇笔记 → 继续编辑」会先读到旧正文、再撞 A0409：
   * 1. 把刚送出的草稿写进详情缓存——SPA 路由返回时编辑器是拿缓存当初始内容的，
   *    不写回就会用这一段没落盘前的旧正文接着编辑，等于凭空回滚一次；
   * 2. 把基线推到同一份草稿，之后的 A0409 才能被正确判成版本令牌漂移而不是真冲突；
   * 3. 让详情查询失效，回到这篇笔记时后台重新拉一份权威数据。
   */
  const flushOnUnload = useCallback(() => {
    const draft = pendingRef.current;
    if (!draft || blocked.current) return;
    if (isOffline()) return;
    const version = versionRef.current;
    void patchNote(
      noteId,
      { title: draft.title, content: draft.content, ...(version ? { version } : {}) },
      { keepalive: true },
    ).catch(() => undefined);
    pendingRef.current = null;
    baseRef.current = draft;
    queryClient.setQueryData<NoteDetail>(detailKey, (current) =>
      current ? { ...current, title: draft.title, content: draft.content } : current,
    );
    void queryClient.invalidateQueries({ queryKey: detailKey });
  }, [detailKey, noteId, queryClient]);

  useEffect(() => {
    const handleOnline = () => {
      if (pendingRef.current) void saveRef.current();
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
  }, [flushOnUnload]);

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
      versionRef.current = current.server.version;
      if (choice === "useServer") {
        pendingRef.current = null;
        baseRef.current = { title: current.server.title, content: current.server.content };
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
      // 覆盖式保存：基线先对齐服务端，这样万一再撞 A0409 也能正确判成令牌漂移
      baseRef.current = { title: current.server.title, content: current.server.content };
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
