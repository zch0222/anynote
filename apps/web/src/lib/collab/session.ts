import { unwrapEnvelope } from "@/lib/api/errors";
import type { LocalNoteStore } from "@/lib/collab/local-persistence";
import { parseCollabRoom } from "@/lib/collab/rooms";
import { type SyncSnapshot, SyncTracker } from "@/lib/collab/sync-state";
import { env } from "@/lib/env";
import { EDITOR_SCHEMA_VERSION } from "@anynote/editor-core/version";
import * as decoding from "lib0/decoding";
// `yjs` / `y-websocket` 一律**动态**引入（见 `openCollabRoom`）：它们是重依赖，
// 静态引入会被算进笔记路由的首屏图。这里只保留类型（编译期擦除，不产生 import）。
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";
import { z } from "zod";

export const collabUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
});

export const collabTokenSchema = z.object({
  token: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: collabUserSchema,
});

export type CollabUser = z.infer<typeof collabUserSchema>;
export type CollabToken = z.infer<typeof collabTokenSchema>;

/** 令牌到期前多久换新的。留足余量，避免刚好卡在重连时过期。 */
const REFRESH_LEAD_SECONDS = 60;

/** 协同服务的自定义消息类型与子类型，与 `apps/collab/src/protocol.ts` 一致。 */
export const MESSAGE_ANYNOTE = 100;
export const ANYNOTE_HELLO = 0;
export const ANYNOTE_ACK = 1;
export const ANYNOTE_EPOCH_MISMATCH = 2;
export const ANYNOTE_STORED = 3;

/** 关闭码：谱系不符、编辑器版本不符、笔记已删除。与协同服务一致。 */
export const CLOSE_EPOCH_MISMATCH = 4409;
export const CLOSE_EDITOR_VERSION = 4426;
export const CLOSE_NOT_FOUND = 4404;

/** 会话无法继续的原因：需要刷新页面、笔记已删除，或本地副本谱系不符需要重建。 */
export type CollabFatal =
  | { kind: "outdated"; serverVersion: number | null }
  | { kind: "deleted" }
  | { kind: "lineage" };

/**
 * 房间名 → noteId。续期时必须重新告知 BFF 是哪个房间：续期即重查权限，
 * 权限被撤销最迟在令牌过期时生效。
 */
function noteIdFromRoom(room: string): number {
  const parsed = parseCollabRoom(room);
  if (!parsed) throw new Error(`非法协同房间名：${room}`);
  return parsed.noteId;
}

/** 协同令牌的请求体：绑定到具体笔记。 */
export type CollabTokenRequest = { noteId: number };

/**
 * 向 BFF 换一枚协同令牌。accessToken 仍在 httpOnly Cookie 里，前端全程拿不到它。
 *
 * 请求体带 `noteId`：BFF 以会话身份查一次协同准入，令牌里带上 `room` 与 `ro`，
 * 协同服务据此强制「令牌房间 = 握手房间」。
 */
export async function fetchCollabToken(
  request: CollabTokenRequest,
  signal?: AbortSignal,
): Promise<CollabToken> {
  const response = await fetch("/api/auth/collab-token", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  });
  return unwrapEnvelope(response, collabTokenSchema.parse);
}

/**
 * 握手的 `lineage` 参数：本地文档为空时 `fresh`；已知谱系时 `epoch:<uuid>`；
 * 本地文档非空但不知道谱系时 `unknown`（服务端落库模式会以 4409 拒绝）。
 */
export function computeLineage(docIsEmpty: boolean, epoch: string | null): string {
  if (epoch) return `epoch:${epoch}`;
  return docIsEmpty ? "fresh" : "unknown";
}

/** 从 4426 的关闭原因 `editor-version:<n>` 里取服务端的编辑器版本。 */
export function parseServerEditorVersion(reason: string | undefined): number | null {
  const match = /^editor-version:(\d+)$/.exec(reason ?? "");
  return match ? Number(match[1]) : null;
}

/** 协同服务写库成功的通知：新版本号与写入的标题。 */
export type CollabStoredNotice = { version: string; title: string | null };

export type CollabSessionState = {
  /** 收到过服务端的 hello 且其声明由服务端落库；本地有同谱系副本时从一开始即为 true。 */
  serverPersist: boolean;
  /** 房间的谱系；未知时为 null。 */
  epoch: string | null;
  /** 从本地库载入了同谱系副本，可以在连上之前放开编辑。 */
  localReady: boolean;
  /** 本地持久化是否可用（有副本或已启用，且没有因错误停用）。 */
  hasLocalPersistence: boolean;
  sync: SyncSnapshot;
  fatal: CollabFatal | null;
  /** 最近一次落库通知；每条通知都是新对象，调用方可按引用判断是否有新写入。 */
  stored: CollabStoredNotice | null;
};

export type CollabSession = {
  doc: Y.Doc;
  provider: WebsocketProvider;
  user: CollabUser;
  /** 当前状态快照。 */
  getState(): CollabSessionState;
  /** 状态变化时回调；返回取消订阅函数。 */
  subscribe(listener: (state: CollabSessionState) => void): () => void;
  /** 删除这篇笔记的本地副本（谱系不符重建前调用）。 */
  clearLocal(): Promise<void>;
  destroy: () => void;
};

export type OpenCollabRoomOptions = {
  /** 可注入假实现，便于在 jsdom 里测生命周期而不真的连 WebSocket。 */
  createProvider?: (
    serverUrl: string,
    room: string,
    doc: Y.Doc,
    params: Record<string, string>,
  ) => WebsocketProvider | Promise<WebsocketProvider>;
  fetchToken?: (request: CollabTokenRequest, signal?: AbortSignal) => Promise<CollabToken>;
  /** 可注入本地持久化实现；默认按需动态加载 IndexedDB 实现。 */
  localStore?: {
    has(noteId: number): boolean;
    open(noteId: number, doc: Y.Doc): Promise<LocalNoteStore>;
  };
  signal?: AbortSignal;
};

/** 动态加载 `y-websocket` 后建 provider（先不连接，由会话注册完消息处理后再连）。 */
async function defaultCreateProvider(
  serverUrl: string,
  room: string,
  doc: Y.Doc,
  params: Record<string, string>,
): Promise<WebsocketProvider> {
  const { WebsocketProvider } = await import("y-websocket");
  return new WebsocketProvider(serverUrl, room, doc, {
    params,
    connect: false,
    // 同一浏览器的多个标签页经 BroadcastChannel 直接互通，不必各自等服务端回包
    disableBc: false,
  });
}

let pruned = false;

async function defaultLocalStore(): Promise<NonNullable<OpenCollabRoomOptions["localStore"]>> {
  const { hasLocalNote, openLocalNoteStore, pruneStaleLocalNotes } = await import(
    "@/lib/collab/local-persistence"
  );
  // 每次页面加载第一次用到协同时清理一次超过保留期的本地副本
  if (!pruned) {
    pruned = true;
    void pruneStaleLocalNotes().catch(() => undefined);
  }
  return { has: hasLocalNote, open: openLocalNoteStore };
}

function isDocEmpty(doc: Y.Doc): boolean {
  return doc.store.clients.size === 0;
}

/**
 * 打开一个协同房间：换令牌 → 载入本地副本 → 建连接 → 写入本人 awareness → 起续期定时器。
 *
 * - 握手带 `editorVersion` 与 `lineage`；服务端落库模式下，服务端先回 hello（带谱系），
 *   之后对每条写方向同步消息回确认，会话据此维护未确认计数（{@link SyncTracker}）。
 * - 本地副本只在服务端声明落库之后才启用：第一次 hello 时建库，之后每次打开先载入它，
 *   谱系已知就可以在连上之前放开编辑，断线期间的改动也不会随关页丢失。
 * - 关闭码 4426 / 4404 / 4409 由 y-websocket 视为终止连接；会话把它们转成 `fatal` 交给界面处理。
 * - 令牌只有 5 分钟有效期，而重连会复用 `provider.params`，所以要定期把 params.token 换成新的。
 */
export async function openCollabRoom(
  room: string,
  options: OpenCollabRoomOptions = {},
): Promise<CollabSession> {
  const fetchToken = options.fetchToken ?? fetchCollabToken;
  const createProvider = options.createProvider ?? defaultCreateProvider;
  const noteId = noteIdFromRoom(room);

  const initial = await fetchToken({ noteId }, options.signal);
  const Y = await import("yjs");
  const doc = new Y.Doc();
  const localApi = options.localStore ?? (await defaultLocalStore());

  const listeners = new Set<(state: CollabSessionState) => void>();
  let local: LocalNoteStore | null = null;
  let epoch: string | null = null;
  let serverPersist = false;
  let helloReceived = false;
  let localReady = false;
  let fatal: CollabFatal | null = null;
  let stored: CollabStoredNotice | null = null;
  let stopped = false;

  const tracker = new SyncTracker({ onChange: () => notify() });

  const getState = (): CollabSessionState => ({
    serverPersist,
    epoch,
    localReady,
    hasLocalPersistence: local?.available ?? false,
    sync: tracker.snapshot,
    fatal,
    stored,
  });

  function notify() {
    const state = getState();
    for (const listener of listeners) listener(state);
  }

  const watchLocal = (store: LocalNoteStore) => {
    store.onDisabled(() => notify());
  };

  // 本地有副本（说明之前在服务端落库模式下打开过）：先载入，谱系已知即可离线编辑
  if (localApi.has(noteId)) {
    const store = await localApi.open(noteId, doc);
    if (store.available) {
      local = store;
      watchLocal(store);
      const loaded = await store.load();
      epoch = await store.getEpoch();
      localReady = loaded && epoch !== null;
      serverPersist = localReady;
    }
  }

  const provider = await createProvider(env.NEXT_PUBLIC_COLLAB_WS_URL, room, doc, {
    token: initial.token,
    editorVersion: String(EDITOR_SCHEMA_VERSION),
    lineage: computeLineage(isDocEmpty(doc), epoch),
  });

  const enableLocal = async () => {
    if (local || stopped) return;
    const store = await localApi.open(noteId, doc);
    if (stopped) {
      store.destroy();
      return;
    }
    if (!store.available) return;
    local = store;
    watchLocal(store);
    await store.load();
    notify();
  };

  provider.messageHandlers[MESSAGE_ANYNOTE] = (_encoder, decoder) => {
    const subType = decoding.readVarUint(decoder);
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(decoding.readVarString(decoder)) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    if (subType === ANYNOTE_HELLO) {
      helloReceived = true;
      serverPersist = payload.serverPersist === true;
      epoch = typeof payload.epoch === "string" ? payload.epoch : epoch;
      provider.params.lineage = computeLineage(isDocEmpty(doc), epoch);
      notify();
      if (serverPersist && epoch) {
        const current = epoch;
        void enableLocal().then(() => local?.setEpoch(current));
      }
    } else if (subType === ANYNOTE_ACK) {
      tracker.ack();
    } else if (subType === ANYNOTE_STORED && typeof payload.version === "string") {
      stored = {
        version: payload.version,
        title: typeof payload.title === "string" ? payload.title : null,
      };
      notify();
    }
  };

  // 本地编辑：排除服务端下发的更新（origin 是 provider）与本地库载入（origin 是本地库）
  const handleDocUpdate = (_update: Uint8Array, origin: unknown) => {
    if (origin === provider) return;
    if (local && origin === local.origin) return;
    if (!serverPersist) return;
    tracker.localEdit(provider.wsconnected);
  };
  doc.on("update", handleDocUpdate);

  provider.on("status", ({ status }: { status: string }) => {
    if (status === "disconnected") tracker.disconnect();
  });
  provider.on("sync", (isSynced: boolean) => {
    if (!isSynced) return;
    tracker.resync();
    // 同步完成却没收到 hello：服务端没有开启落库（例如回滚），本地副本不再适用
    if (!helloReceived && local) {
      serverPersist = false;
      localReady = false;
      void local.clear();
      local = null;
      notify();
    }
  });
  provider.on("connection-close", () => {
    helloReceived = false;
    provider.params.lineage = computeLineage(isDocEmpty(doc), epoch);
  });
  provider.on("closed", ({ code, reason }: { code: number; reason: string }) => {
    if (code === CLOSE_EDITOR_VERSION) {
      fatal = { kind: "outdated", serverVersion: parseServerEditorVersion(reason) };
    } else if (code === CLOSE_NOT_FOUND) {
      fatal = { kind: "deleted" };
      void local?.clear();
      local = null;
    } else if (code === CLOSE_EPOCH_MISMATCH) {
      fatal = { kind: "lineage" };
    } else {
      return;
    }
    // 这三个关闭码只有服务端落库模式会发，即使还没收到 hello 也按落库模式展示
    serverPersist = true;
    notify();
  });

  provider.awareness.setLocalStateField("user", {
    name: initial.user.name,
    color: initial.user.color,
  });
  provider.connect();

  let timer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRefresh = (expiresIn: number) => {
    // 有效期太短时至少隔 10 秒再续，避免异常配置把这里变成忙循环。
    const delaySeconds = Math.max(expiresIn - REFRESH_LEAD_SECONDS, 10);
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        const next = await fetchToken({ noteId });
        provider.params.token = next.token;
        scheduleRefresh(next.expiresIn);
      } catch (error) {
        // 续期失败不影响当前已建立的连接，等下一轮再试。
        console.error("[collab] 协同令牌续期失败", error);
        scheduleRefresh(REFRESH_LEAD_SECONDS);
      }
    }, delaySeconds * 1_000);
  };
  scheduleRefresh(initial.expiresIn);

  return {
    doc,
    provider,
    user: initial.user,
    getState,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async clearLocal() {
      const store = local;
      local = null;
      if (store) {
        await store.clear();
        return;
      }
      const { deleteLocalNote } = await import("@/lib/collab/local-persistence");
      await deleteLocalNote(noteId);
    },
    destroy: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      tracker.destroy();
      doc.off("update", handleDocUpdate);
      provider.destroy();
      local?.destroy();
      doc.destroy();
    },
  };
}
