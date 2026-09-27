import { type CollabFatal, useCollabRoom } from "@/features/collab/use-collab-room";
import { injectInitialContent, isCollabDocEmpty } from "@/lib/collab/inject";
import {
  COLLAB_INJECT_SETTLE_MS,
  collabMeta,
  isCollabInternalOrigin,
  readSavedVersion,
  shouldInject,
  writeSavedVersion,
} from "@/lib/collab/injection";
import { collabNoteRoom } from "@/lib/collab/rooms";
import type { CollabStoredNotice, CollabUser } from "@/lib/collab/session";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 服务端落库模式下的同步状态（徽标与离开拦截据此判断）。 */
export type CollabSyncStatus = "connecting" | "synced" | "unsynced" | "offline" | "outdated";

export type UseCollabNoteOptions = {
  noteId: number;
  /** 总开关（`NEXT_PUBLIC_COLLAB_NOTES`）且权限 ≥ EDIT 时为 true。 */
  enabled: boolean;
  /** 编辑器就绪后的实例；未就绪传 null。 */
  editor: Editor | null;
  /** REST 拿到的正文（含补齐的顶部 H1），客户端保存链路下冷启动注入用它。 */
  markdown: string | null;
  /**
   * 本地编辑信号（客户端保存链路）。远端广播、冷启动注入与 meta 写入都不触发。
   * 不带正文参数：调用方只记「下一拍 `onChange` 是本地编辑」，正文取 `onChange` 带来的那一份。
   */
  onLocalEdit?: (() => void) | undefined;
};

export type CollabNoteState = {
  /** 协同运行时可用（开关打开且 provider 已建立）。 */
  active: boolean;
  /** 房间的 Y.Doc；未连接时为 null。 */
  doc: import("yjs").Doc | null;
  /** y-websocket provider；未连接时为 null。 */
  provider: import("y-websocket").WebsocketProvider | null;
  user: CollabUser | null;
  connected: boolean;
  /** 连接降级（连不上 / 令牌签发失败），页面据此提示并回退单人模式。 */
  degraded: boolean;
  /**
   * 正文已就位，可以放手编辑。
   *
   * 服务端落库时：本地副本已载入且谱系已知，或已与服务端完成首次同步；
   * 客户端保存链路：房间正文已注入或本来就非空。
   */
  contentReady: boolean;
  /** 编辑器是否可写。非协同与降级后恒为 true（回到单人链路）。 */
  editable: boolean;
  peers: ReturnType<typeof useCollabRoom>["peers"];
  /** 服务端声明由它落库：客户端不再发保存请求。 */
  serverPersist: boolean;
  /** 服务端落库模式下的同步状态。 */
  syncStatus: CollabSyncStatus;
  /** 本地持久化是否可用（离线改动能不能留在本设备）。 */
  hasLocalPersistence: boolean;
  /** 断线后有过编辑、尚未随重连补齐。 */
  editedWhileOffline: boolean;
  /** 会话无法继续的原因（需刷新、笔记已删除）。 */
  fatal: CollabFatal | null;
  /** 有未确认改动，离开页面前需要拦截。 */
  leaveGuard: { active: boolean; message: string };
  /** 协同服务最近一次写库成功的通知；每条通知都是新对象。 */
  stored: CollabStoredNotice | null;
  /** 谱系不符重建会话时，从本地取回的尚未同步的正文；没有时为 null。 */
  recoveredMarkdown: string | null;
  dismissRecovered: () => void;
  /** 客户端保存链路：共享 meta 的已落库版本号。 */
  savedVersion: string | null;
  /** 客户端保存链路：保存成功后把新版本号写进共享 meta。 */
  publishSavedVersion: (version: string | null) => void;
  reconnect: () => void;
};

/** 读取编辑器当前 Markdown（tiptap-markdown 的 storage 接口），不引入编辑器内核包。 */
function readMarkdown(editor: Editor | null): string | null {
  const storage = editor?.storage as { markdown?: { getMarkdown?: () => string } } | undefined;
  return storage?.markdown?.getMarkdown?.() ?? null;
}

/**
 * 笔记协同运行时：房间连接，以及两条保存路径的分流。
 *
 * - 服务端落库（握手 hello 声明 `serverPersist`，或本地有同谱系副本）：正文由协同服务写库，
 *   这里只推导同步状态、可写条件与离开拦截，不注入、不写 meta、不触发本地保存。
 * - 客户端保存链路（旧服务端或服务端落库开关关闭）：冷启动注入守卫、共享版本号与保存排队过滤，行为不变。
 */
export function useCollabNote(options: UseCollabNoteOptions): CollabNoteState {
  const { noteId, enabled, editor, markdown, onLocalEdit } = options;
  const room = useMemo(() => (enabled ? collabNoteRoom(noteId) : null), [enabled, noteId]);

  const editorRef = useRef(editor);
  editorRef.current = editor;
  const [recoveredMarkdown, setRecoveredMarkdown] = useState<string | null>(null);
  const pendingEditsRef = useRef(false);
  const onLineageReset = useCallback(() => {
    // 丢弃本地文档前，把尚未同步的正文取出来交还给用户
    if (!pendingEditsRef.current) return;
    const current = readMarkdown(editorRef.current);
    if (current) setRecoveredMarkdown(current);
  }, []);
  const roomOptions = useMemo(() => ({ onLineageReset }), [onLineageReset]);

  const { doc, provider, user, status, synced, peers, reconnect, session } = useCollabRoom(
    room,
    roomOptions,
  );
  const serverPersist = session.serverPersist;
  const serverPersistRef = useRef(serverPersist);
  serverPersistRef.current = serverPersist;
  pendingEditsRef.current = session.sync.pending > 0 || session.sync.editedWhileOffline;

  const [savedVersion, setSavedVersion] = useState<string | null>(null);
  const [injectedReady, setInjectedReady] = useState(false);
  /**
   * 与服务端完成过首次同步的文档（之后断线也不再回到「连接中」）。
   * 按文档实例记录：谱系重建换了新文档后，要等新文档同步完成才算就位。
   */
  const [syncedDoc, setSyncedDoc] = useState<import("yjs").Doc | null>(null);
  const everSynced = doc !== null && syncedDoc === doc;
  const changeRef = useRef(onLocalEdit);
  changeRef.current = onLocalEdit;

  useEffect(() => {
    if (doc && synced) setSyncedDoc(doc);
  }, [doc, synced]);

  // 客户端保存链路：共享 meta.savedVersion 同步到本地 state
  useEffect(() => {
    if (!doc) {
      setSavedVersion(null);
      return;
    }
    const meta = collabMeta(doc);
    const sync = () => setSavedVersion(readSavedVersion(doc));
    sync();
    meta.observe(sync);
    return () => meta.unobserve(sync);
  }, [doc]);

  // 客户端保存链路的正文就位判定：没有待注入的正文，或房间正文已非空
  useEffect(() => {
    if (!enabled) {
      setInjectedReady(true);
      return;
    }
    if (!doc) {
      setInjectedReady(false);
      return;
    }
    const evaluate = () => setInjectedReady(!markdown || !isCollabDocEmpty(doc));
    evaluate();
    doc.on("update", evaluate);
    return () => doc.off("update", evaluate);
  }, [enabled, doc, markdown]);

  /**
   * 冷启动注入守卫（客户端保存链路）。条件持续满足 `COLLAB_INJECT_SETTLE_MS` 才注入，
   * 到点再判一次；服务端落库时房间由服务端开房加载，这里永不注入。
   */
  useEffect(() => {
    if (!doc || !provider || !editor || !markdown) return;
    const meta = collabMeta(doc);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const eligible = () =>
      !serverPersistRef.current &&
      shouldInject({
        synced: provider.synced,
        isEmpty: isCollabDocEmpty(doc),
        seeded: meta.get("seeded") === true,
        peerClientIds: [...provider.awareness.getStates().keys()],
        selfClientId: doc.clientID,
      });

    const evaluate = () => {
      if (done) return;
      if (!eligible()) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (done || !eligible()) return;
        done = true;
        injectInitialContent(editor, markdown, doc);
      }, COLLAB_INJECT_SETTLE_MS);
    };

    evaluate();
    doc.on("update", evaluate);
    meta.observe(evaluate);
    provider.on("sync", evaluate);
    provider.awareness.on("change", evaluate);
    return () => {
      if (timer) clearTimeout(timer);
      doc.off("update", evaluate);
      meta.unobserve(evaluate);
      provider.off("sync", evaluate);
      provider.awareness.off("change", evaluate);
    };
  }, [doc, provider, editor, markdown]);

  /** 客户端保存链路的保存排队过滤：只有本地编辑触发。服务端落库时不触发。 */
  useEffect(() => {
    if (!doc || !provider) return;
    const handler = (_update: Uint8Array, origin: unknown) => {
      if (serverPersistRef.current) return;
      if (origin === provider) return;
      if (isCollabInternalOrigin(origin)) return;
      changeRef.current?.();
    };
    doc.on("update", handler);
    return () => doc.off("update", handler);
  }, [doc, provider]);

  const publishSavedVersion = useCallback(
    (version: string | null) => {
      if (!doc || !version || serverPersistRef.current) return;
      writeSavedVersion(doc, version);
    },
    [doc],
  );

  const dismissRecovered = useCallback(() => setRecoveredMarkdown(null), []);

  const degraded = status === "error";
  const active = Boolean(enabled && doc && provider);
  // 谱系不符由房间层自动重建，不交给界面；重建完成前旧文档已断开，不能再放开编辑
  const rebuilding = session.fatal?.kind === "lineage";
  const fatal = rebuilding ? null : session.fatal;
  const persistReady = session.localReady || everSynced;
  const contentReady = serverPersist ? Boolean(doc) && persistReady && !rebuilding : injectedReady;
  const connected = status === "connected";

  // 连接建立后服务端还要校验编辑器版本与谱系（可能以 4426 / 4409 拒绝），完成同步才算已同步
  let syncStatus: CollabSyncStatus = "synced";
  if (fatal?.kind === "outdated") syncStatus = "outdated";
  else if (!contentReady) syncStatus = "connecting";
  else if (!connected) syncStatus = "offline";
  else if (!synced) syncStatus = "connecting";
  else if (session.sync.unsynced) syncStatus = "unsynced";

  const guardActive =
    serverPersist &&
    fatal === null &&
    (session.sync.unsynced || (syncStatus === "offline" && session.sync.editedWhileOffline));
  const leaveGuard = {
    active: guardActive,
    message: session.hasLocalPersistence
      ? "改动尚未同步，已保存在本设备。确定离开吗？"
      : "改动尚未同步，离开后会丢失。确定离开吗？",
  };

  return {
    active,
    doc,
    provider,
    user,
    connected,
    degraded,
    contentReady,
    // 降级后回到单人链路，此时不该再锁着编辑器不让人写
    editable: !enabled || degraded || (contentReady && fatal === null),
    peers,
    serverPersist,
    syncStatus,
    hasLocalPersistence: session.hasLocalPersistence,
    editedWhileOffline: session.sync.editedWhileOffline,
    fatal,
    leaveGuard,
    stored: session.stored,
    recoveredMarkdown,
    dismissRecovered,
    savedVersion,
    publishSavedVersion,
    reconnect,
  };
}
