"use client";

import { type CollabSession, type CollabUser, openCollabRoom } from "@/lib/collab/session";
import { useEffect, useState } from "react";
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
  error: Error | null;
  peers: CollabPeer[];
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

  useEffect(() => {
    setSession(null);
    setPeers([]);
    setError(null);
    if (!room) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");
    let disposed = false;
    let active: CollabSession | null = null;
    const controller = new AbortController();

    openCollabRoom(room, { signal: controller.signal })
      .then((next) => {
        // 组件在换令牌期间就卸载了：直接把刚建好的会话拆掉，别留下悬空连接。
        if (disposed) {
          next.destroy();
          return;
        }
        active = next;
        setSession(next);

        const syncPeers = () => setPeers(readPeers(next));
        next.provider.on("status", ({ status: wsStatus }) => {
          setStatus(wsStatus === "connected" ? "connected" : "connecting");
        });
        next.provider.on("connection-close", () => setStatus("connecting"));
        next.provider.awareness.on("change", syncPeers);
        syncPeers();
        if (next.provider.wsconnected) setStatus("connected");
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
    };
  }, [room]);

  return {
    doc: session?.doc ?? null,
    provider: session?.provider ?? null,
    user: session?.user ?? null,
    status,
    error,
    peers,
  };
}
