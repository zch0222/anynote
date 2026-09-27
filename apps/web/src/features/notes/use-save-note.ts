"use client";

import { ApiError, unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { RES_CODE } from "@anynote/api-core/codes";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { leaveRecentlyConfirmed } from "./leave-confirmation";
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
/** 协同模式（客户端保存链路）的防抖时长。 */
export const COLLAB_AUTOSAVE_DEBOUNCE_MS = 3000;
/** 持续输入时距首个未保存改动的最长等待，到期即保存一次。 */
export const AUTOSAVE_MAX_WAIT_MS = 10_000;
/** 可重试失败的重试间隔。 */
export const RETRY_DELAY_MS = 5000;
/**
 * keepalive 请求体的上限。
 *
 * 浏览器对同一页面所有在途 keepalive 请求的请求体合计限制为 64 KiB，
 * 这里留出请求头与其他 keepalive 请求的余量。
 */
export const KEEPALIVE_BODY_LIMIT_BYTES = 60 * 1024;

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
  /** 可重试的失败，等待重试 */
  | "error"
  /** 版本冲突，等用户决定 */
  | "conflict"
  /** 不可重试的失败，停止自动重试，等用户处理 */
  | "failed";

/** 离开拦截的确认文案（单人保存链路）。 */
export const UNSAVED_LEAVE_MESSAGE = "改动尚未保存，离开后会丢失。确定离开吗？";

/**
 * 当前保存状态下离开页面是否会丢改动。
 *
 * 离线、失败与冲突时卸载补发会被跳过或大概率失败，改动只在内存里；
 * 待保存与保存中由卸载补发送出，不拦截。
 */
export function hasUnsavedRisk(status: NoteSaveStatus): boolean {
  return status === "offline" || status === "error" || status === "failed" || status === "conflict";
}

/** 不可重试失败的类别，决定徽标文案与处理方式。 */
export type NoteSaveFailureKind = "auth" | "forbidden" | "notFound" | "invalid";

export type NoteSaveFailure = { kind: NoteSaveFailureKind; message: string };

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

const AUTH_CODES = new Set<string>([RES_CODE.REFRESH_INVALID, RES_CODE.MISSING_TOKEN]);
const FORBIDDEN_CODES = new Set<string>(["A0300", RES_CODE.UNAUTHORIZED]);
const NOT_FOUND_CODES = new Set<string>(["A0404"]);

/**
 * 判定一次保存失败能否重试。
 *
 * 网络错误、超时、HTTP 5xx 与 B / C 类业务码返回 null（可重试）；
 * 登录失效、无权限、笔记不存在与其他 A 类业务码返回失败类别（不可重试）。
 *
 * @param error 保存请求抛出的错误
 * @returns 不可重试时返回失败类别与原因，可重试时返回 null
 */
export function classifySaveFailure(error: unknown): NoteSaveFailure | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 401 || AUTH_CODES.has(error.code)) {
    return { kind: "auth", message: "登录已过期，请重新登录后重试" };
  }
  if (error.status >= 500) return null;
  if (error.status === 403 || FORBIDDEN_CODES.has(error.code)) {
    return { kind: "forbidden", message: error.message || "没有编辑这篇笔记的权限" };
  }
  if (error.status === 404 || NOT_FOUND_CODES.has(error.code)) {
    return { kind: "notFound", message: error.message || "笔记不存在或已被删除" };
  }
  if (error.code.startsWith("A")) {
    return { kind: "invalid", message: error.message || "保存的内容不被接受" };
  }
  return null;
}

/** 草稿作为 PATCH 请求体时的字节数，用于判断能否走 keepalive。 */
function requestBodyBytes(body: unknown): number {
  return new TextEncoder().encode(JSON.stringify(body)).length;
}

/**
 * 笔记自动保存（单人模式与 v2.0 协同的客户端保存链路）。
 *
 * - 防抖合并连续输入，持续输入时最长等待 {@link AUTOSAVE_MAX_WAIT_MS} 也会保存一次。
 * - 乐观更新详情缓存，失败回滚到请求前的快照。
 * - 版本号只由保存响应推进，不从详情缓存的 `updateTime` 回灌。
 * - A0409 时回读服务端内容与 `baseRef` 比对：一致则换号重发，不一致才进入冲突。
 * - 可重试的失败进入 `error` 并定时重试；不可重试的失败进入 `failed` 并停止重试。
 * - 有未保存改动时拦截关页；关页用 keepalive 兜底，SPA 路由卸载用普通请求。
 */
export function useSaveNote(options: {
  noteId: number;
  initialVersion: string | null;
  debounceMs?: number | undefined;
  /** 持续输入时的最长等待，默认 {@link AUTOSAVE_MAX_WAIT_MS}。 */
  maxWaitMs?: number | undefined;
  /**
   * 版本冲突的处理策略。
   *
   * - `prompt`（默认）：回读比对，内容一致则换号重发，被别人改过才弹冲突对话框。
   * - `overwrite`：v2.0 协同的客户端保存链路，A0409 一律对齐服务端版本号后重发。
   */
  conflictPolicy?: "prompt" | "overwrite" | undefined;
  /** 最近一次成功落库的版本令牌（v2.0 协同来自共享 `meta.savedVersion`），传空为空操作。 */
  sharedVersion?: string | null | undefined;
  /** 保存成功后的回调，携带新版本号。 */
  onSaved?: ((version: string | null) => void) | undefined;
  /** 冲突时选择「放弃我的改动」后调用，调用方据此把服务端内容载入编辑器。 */
  onDiscardLocal?: ((server: NoteDraft) => void) | undefined;
}) {
  const {
    noteId,
    initialVersion,
    debounceMs = AUTOSAVE_DEBOUNCE_MS,
    maxWaitMs = AUTOSAVE_MAX_WAIT_MS,
    conflictPolicy = "prompt",
    sharedVersion = null,
    onSaved,
    onDiscardLocal,
  } = options;
  const queryClient = useQueryClient();
  const detailKey = useMemo(() => noteQueryKeys.detail(noteId), [noteId]);

  const [status, setStatusState] = useState<NoteSaveStatus>("saved");
  /** 最新状态的同步副本：异步流程（如 flush 之后）要在重新渲染前读到结果。 */
  const statusRef = useRef<NoteSaveStatus>("saved");
  const setStatus = useCallback((next: NoteSaveStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);
  const getStatus = useCallback(() => statusRef.current, []);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [conflict, setConflict] = useState<NoteConflict | null>(null);
  const [failure, setFailure] = useState<NoteSaveFailure | null>(null);

  const versionRef = useRef<string | null>(initialVersion);
  /** 上一次确认与服务端一致的内容，用来判断 A0409 是真冲突还是版本令牌漂移。 */
  const baseRef = useRef<NoteDraft | null>(null);
  /** 已经 seed 过版本号的笔记 id；换笔记时重新 seed，同一篇只 seed 一次。 */
  const seededFor = useRef<number | null>(null);
  /** 尚未交给请求的最新草稿。 */
  const pendingRef = useRef<NoteDraft | null>(null);
  /** 正在请求中的草稿；请求结束（无论成败）即清空，供卸载时补发。 */
  const inFlightDraft = useRef<NoteDraft | null>(null);
  /** 当前这一轮 `save()` 的 promise，`flush()` 用它等待在途请求。 */
  const inFlightSave = useRef<Promise<void> | null>(null);
  /** 首个尚未保存的改动出现的时刻，用于最长等待。 */
  const firstPendingAt = useRef<number | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  /** 冲突未解决前不再自动发保存。 */
  const blocked = useRef(false);
  /** 不可重试的失败未处理前不再自动发保存。 */
  const halted = useRef(false);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onDiscardLocalRef = useRef(onDiscardLocal);
  onDiscardLocalRef.current = onDiscardLocal;

  /** 在没有在途请求时把共享版本号同步进本地版本号。 */
  useEffect(() => {
    if (!sharedVersion) return;
    if (inFlight.current) return;
    versionRef.current = sharedVersion;
  }, [sharedVersion]);

  /** 每篇笔记只在第一次拿到服务端时间戳时 seed 一次版本号与基线内容。 */
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

  /** 排一次防抖保存；持续输入时延迟不会超过最长等待的剩余时间。 */
  const armDebounce = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const startedAt = firstPendingAt.current ?? Date.now();
    const remaining = maxWaitMs - (Date.now() - startedAt);
    const delay = Math.max(0, Math.min(debounceMs, remaining));
    debounceTimer.current = setTimeout(() => void saveRef.current(), delay);
  }, [debounceMs, maxWaitMs]);

  /** 发一次保存请求并处理结果。调用方保证同一时刻只有一个在跑。 */
  const runSave = useCallback(async (): Promise<SaveOutcome> => {
    const draft = pendingRef.current;
    if (!draft) return "done";
    firstPendingAt.current = null;
    const baseline = baseRef.current;
    if (baseline && baseline.title === draft.title && baseline.content === draft.content) {
      pendingRef.current = null;
      inFlightDraft.current = null;
      setStatus("saved");
      return "done";
    }
    pendingRef.current = null;
    inFlightDraft.current = draft;
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
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists });
      setLastSavedAt(new Date());
      onSavedRef.current?.(result.version ?? toVersion(result.updateTime));
      if (pendingRef.current) {
        setStatus("pending");
        armDebounce();
      } else {
        setStatus("saved");
      }
      return "done";
    } catch (error) {
      queryClient.setQueryData<NoteDetail>(detailKey, snapshot);
      const local = pendingRef.current ?? draft;
      pendingRef.current = local;

      if (error instanceof ApiError && error.code === VERSION_CONFLICT_CODE) {
        if (conflictPolicy === "overwrite") {
          const fresh = await fetchNote(noteId).catch(() => null);
          const freshVersion = toVersion(fresh?.updateTime);
          if (freshVersion === null) {
            setStatus("error");
            return "done";
          }
          versionRef.current = freshVersion;
          baseRef.current = { title: fresh?.title ?? "", content: fresh?.content ?? "" };
          pendingRef.current = pendingRef.current ?? local;
          return "resync";
        }

        const server = await fetchNote(noteId).catch(() => null);
        const serverDraft = { title: server?.title ?? "", content: server?.content ?? "" };
        const serverVersion = toVersion(server?.updateTime);
        const base = baseRef.current;
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
          local: pendingRef.current ?? local,
          server: {
            ...serverDraft,
            version: serverVersion,
            updateTime: server?.updateTime ?? null,
          },
        });
        return "done";
      }

      const permanent = classifySaveFailure(error);
      if (permanent) {
        halted.current = true;
        setFailure(permanent);
        setStatus("failed");
        return "done";
      }

      setStatus(isOffline() ? "offline" : "error");
      return "done";
    } finally {
      inFlightDraft.current = null;
    }
  }, [armDebounce, conflictPolicy, detailKey, noteId, queryClient, setStatus]);

  const save = useCallback((): Promise<void> => {
    if (inFlight.current || blocked.current || halted.current || !pendingRef.current) {
      return Promise.resolve();
    }
    if (isOffline()) {
      setStatus("offline");
      return Promise.resolve();
    }

    inFlight.current = true;
    const running = (async () => {
      let outcome: SaveOutcome = "done";
      try {
        // 版本令牌漂移时换号重发的上限；v2.0 协同链路放宽到 4 次。
        const maxAttempts = conflictPolicy === "overwrite" ? 4 : 2;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (!pendingRef.current) break;
          outcome = await runSave();
          if (outcome === "done") break;
        }
      } finally {
        inFlight.current = false;
        inFlightSave.current = null;
      }
      if (outcome === "resync") {
        setStatus("error");
      }
    })();
    inFlightSave.current = running;
    return running;
  }, [conflictPolicy, runSave, setStatus]);

  saveRef.current = save;

  // 可重试的失败按固定间隔重试，直到成功或用户再次编辑触发新的防抖
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
      if (blocked.current || halted.current) return;
      if (firstPendingAt.current === null) firstPendingAt.current = Date.now();
      // 请求在途时徽标保持「保存中」，请求结束后由成功分支补排这批改动
      if (!inFlight.current) setStatus("pending");
      armDebounce();
    },
    [armDebounce, setStatus],
  );

  /** 立刻落盘等待中的改动；有在途请求时先等它结束。 */
  const flush = useCallback(async () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = null;
    const running = inFlightSave.current;
    if (running) await running;
    await saveRef.current();
  }, []);

  /** 不可重试的失败处理后（例如重新登录），手动再保存一次。 */
  const retry = useCallback(async () => {
    halted.current = false;
    setFailure(null);
    await saveRef.current();
  }, []);

  /**
   * 页面即将卸载时把未保存的草稿送出去，不等待响应。
   *
   * 先把草稿写进详情缓存并推进基线，SPA 回到这篇笔记时编辑器读到的是这份草稿；
   * 请求结束后让详情查询失效，由后台重新拉取权威数据。
   *
   * @param transport `keepalive` 用于关页（请求体超过上限时退回普通请求），`fetch` 用于 SPA 路由卸载
   */
  const flushDetached = useCallback(
    (transport: "keepalive" | "fetch") => {
      const draft = pendingRef.current ?? inFlightDraft.current;
      if (!draft || blocked.current || halted.current) return;
      if (isOffline()) return;
      const version = versionRef.current;
      const body = { title: draft.title, content: draft.content, ...(version ? { version } : {}) };
      const keepalive =
        transport === "keepalive" && requestBodyBytes(body) <= KEEPALIVE_BODY_LIMIT_BYTES;
      pendingRef.current = null;
      inFlightDraft.current = null;
      baseRef.current = draft;
      queryClient.setQueryData<NoteDetail>(detailKey, (current) =>
        current ? { ...current, title: draft.title, content: draft.content } : current,
      );
      void patchNote(noteId, body, keepalive ? { keepalive: true } : undefined)
        .then((result) => {
          queryClient.setQueryData<NoteDetail>(detailKey, (current) =>
            current ? { ...current, updateTime: result.updateTime ?? current.updateTime } : current,
          );
        })
        .catch(() => undefined)
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: detailKey });
        });
    },
    [detailKey, noteId, queryClient],
  );

  useEffect(() => {
    const handleOnline = () => {
      if (pendingRef.current) void saveRef.current();
    };
    const handleOffline = () => {
      if (pendingRef.current) setStatus("offline");
    };
    /** 有未保存改动时拦截关页，同时立刻发起一次普通保存。 */
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!pendingRef.current && !inFlight.current) return;
      // 用户刚在站内确认过离开（跳转退化成了整页加载）：不再二次拦截，只尽力保存
      if (!leaveRecentlyConfirmed()) {
        event.preventDefault();
        event.returnValue = "";
      }
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
      void saveRef.current();
    };
    const handlePageHide = () => flushDetached("keepalive");
    /**
     * 切到后台时走正常保存以推进版本号。移动端切 App、锁屏时 `pagehide` 不保证触发，
     * 这是页面被系统回收前最后一个可靠时机。
     */
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      if (inFlight.current) return;
      void saveRef.current();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushDetached, setStatus]);

  // SPA 路由卸载时页面仍在，用普通请求送出未保存的内容
  useEffect(() => {
    return () => {
      clearTimers();
      flushDetached("fetch");
    };
  }, [clearTimers, flushDetached]);

  /**
   * 处理版本冲突。
   *
   * @param choice `keepLocal` 用服务端最新版本号覆盖保存本地最新草稿；
   *   `useServer` 放弃本地改动，缓存与编辑器切到服务端内容
   */
  const resolveConflict = useCallback(
    async (choice: "keepLocal" | "useServer") => {
      const current = conflict;
      if (!current) return;
      blocked.current = false;
      setConflict(null);
      versionRef.current = current.server.version;
      baseRef.current = { title: current.server.title, content: current.server.content };
      if (choice === "useServer") {
        pendingRef.current = null;
        inFlightDraft.current = null;
        firstPendingAt.current = null;
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
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
        onDiscardLocalRef.current?.({
          title: current.server.title,
          content: current.server.content,
        });
        setStatus("saved");
        return;
      }
      pendingRef.current = pendingRef.current ?? current.local;
      await save();
    },
    [conflict, detailKey, queryClient, save, setStatus],
  );

  return {
    status,
    lastSavedAt,
    conflict,
    /** 不可重试失败的原因；只在 `status === "failed"` 时非空。 */
    failure,
    scheduleSave,
    flush,
    retry,
    resolveConflict,
    /** 当前是否有尚未确认落库的改动。 */
    hasPendingChanges: () => pendingRef.current !== null || inFlight.current,
    /** 最新保存状态，不等重新渲染。 */
    getStatus,
  };
}
