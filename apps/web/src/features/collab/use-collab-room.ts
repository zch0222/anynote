"use client";

import type { CollabSession, CollabUser } from "@/lib/collab/session";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";

export type CollabStatus = "connecting" | "connected" | "disconnected" | "error";

/** awareness 里的一位在线成员。`self` 用来在列表里把自己标出来。 */
export type CollabPeer = {
  clientId: number;
  name: string;
  color: string;
  self: boolean;
};

export type CollabRoomState = {
  doc: Y.Doc | null;
  provider: WebsocketProvider | null;
  user: CollabUser | null;
  status: CollabStatus;
  /**
   * **房间内容是否已经同步到本地**（D-11 的「文档已移除」判定要用）。
   *
   * 与 `status === "connected"` 不是一回事：`connected` 只说明 WebSocket 握手成功，
   * 此刻本地 Y.Doc 还是空的，索引里的条目要等服务端把同步步推过来才有。
   * 只认 `connected` 会把"还没收到"读成"没有"——刚打开一篇正常文档就会看到
   * 「已从文档库移除」。所以这个判定必须等真正的 sync 完成。
   */
  synced: boolean;
  error: Error | null;
  peers: CollabPeer[];
  /** 手动重建连接（D-10 图例 16 · D-11 图例 12）。 */
  reconnect: () => void;
};

function readPeers(session: CollabSession): CollabPeer[] {
  const local = session.doc.clientID;
  const peers: CollabPeer[] = [];
  for (const [clientId, state] of session.provider.awareness.getStates()) {
    const user = (state as { user?: { name?: unknown; color?: unknown } } | undefined)?.user;
    if (!user) continue;
    peers.push({
      clientId,
      name: typeof user.name === "string" ? user.name : "匿名",
      color: typeof user.color === "string" ? user.color : "#64748b",
      self: clientId === local,
    });
  }
  // 自己排最前，其余按 clientId 稳定排序，避免列表随 Map 迭代顺序抖动
  return peers.sort((a, b) => Number(b.self) - Number(a.self) || a.clientId - b.clientId);
}

/**
 * 连接一个协同房间并跟踪它的状态。
 *
 * `room` 传 null 表示暂不连接（例如路由参数还没解析出来）。
 * 房间名变化会先销毁旧会话再建新的，保证不会有两个 provider 抢同一个 Y.Doc。
 */
export function useCollabRoom(room: string | null): CollabRoomState {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [status, setStatus] = useState<CollabStatus>("connecting");
  const [error, setError] = useState<Error | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [synced, setSynced] = useState(false);
  /**
   * 当前会话的镜像，只给 `reconnect` 用。
   *
   * 不能直接从 `session` state 里取：那会让 `reconnect` 的引用随每次会话变化，
   * 而调用方（错误态的「重新连接」按钮）会把它塞进 props 或 effect 依赖。
   * 用 ref 后 `reconnect` 可以恒定，读者也不必关心它在哪个渲染帧里被调用。
   */
  const sessionRef = useRef<CollabSession | null>(null);
  /**
   * 会话还没建立时的重试计数。
   *
   * 换令牌失败（过期、BFF 502）后没有任何 provider 可以重连，只能把建立流程
   * 整个重跑一遍——用计数驱动 effect 重入，比在 hook 里复制一份
   * 「换令牌 + 建 provider + 起续期」的流程安全得多，那份逻辑只在 session.ts 里。
   */
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 是刻意的重跑信号——它不进 effect 体，只在换令牌失败后驱动整个建立流程重入（见 reconnect 的说明）。删掉它「重新连接」在 error 态就永久失效。
  useEffect(() => {
    setSession(null);
    sessionRef.current = null;
    setPeers([]);
    setError(null);
    // 换房间时先退回"未同步"，否则新房间会短暂沿用上一间的 synced=true
    setSynced(false);
    if (!room) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");
    let disposed = false;
    let active: CollabSession | null = null;
    const controller = new AbortController();

    // 动态加载 session：它牵出 yjs / y-websocket（重依赖），静态引入会把这两者
    // 并进笔记路由的首屏图，把 `/notes/[baseId]/[noteId]` 顶出预算（仓库禁止清单）。
    import("@/lib/collab/session")
      .then(({ openCollabRoom }) => openCollabRoom(room, { signal: controller.signal }))
      .then((next) => {
        // 组件在换令牌期间就卸载了：直接把刚建好的会话拆掉，别留下悬空连接。
        if (disposed) {
          next.destroy();
          return;
        }
        active = next;
        sessionRef.current = next;
        setSession(next);

        const syncPeers = () => setPeers(readPeers(next));
        next.provider.on("status", ({ status: wsStatus }) => {
          setStatus(wsStatus === "connected" ? "connected" : "connecting");
        });
        next.provider.on("connection-close", () => setStatus("connecting"));
        // `synced` 只在真正收到服务端状态后才为真；断线时 y-websocket 会把它置回 false，
        // 于是一次重连结束后我们仍能知道索引是不是又完整了。
        next.provider.on("sync", (isSynced: boolean) => setSynced(isSynced));
        next.provider.awareness.on("change", syncPeers);
        syncPeers();
        if (next.provider.wsconnected) setStatus("connected");
        if (next.provider.synced) setSynced(true);
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(cause instanceof Error ? cause : new Error("协同连接失败"));
        setStatus("error");
      });

    return () => {
      disposed = true;
      controller.abort();
      active?.destroy();
      // 只有仍指向本次 effect 建立的会话时才清空，避免旧 effect 的清理
      // 把接任的新会话引用抹掉（换房间 / 重连时两者会交错执行）。
      if (sessionRef.current === active) sessionRef.current = null;
    };
  }, [room, attempt]);

  /**
   * 手动重建连接（D-10 图例 16 · D-11 图例 12）。
   *
   * 两条路径，取决于会话是否已经建立：
   * 1. 已有 provider → `disconnect()` 后 `connect()`。Y.Doc 与 awareness 原样保留，
   *    所以本地还没同步出去的改动会随新连接一起推上去（这正是断线提示条敢写
   *    「恢复后会自动同步你的改动」的依据）。
   * 2. 还没有 provider（换令牌就失败了，状态是 `error`）→ 重跑一遍建立流程。
   *    这种情况对一个 null provider 调 connect 是空转，用户会以为按钮坏了。
   */
  const reconnect = useCallback(() => {
    const active = sessionRef.current;
    if (!active) {
      setAttempt((value) => value + 1);
      return;
    }
    setError(null);
    setStatus("connecting");
    active.provider.disconnect();
    active.provider.connect();
  }, []);

  return {
    doc: session?.doc ?? null,
    provider: session?.provider ?? null,
    user: session?.user ?? null,
    status,
    synced,
    error,
    peers,
    reconnect,
  };
}
