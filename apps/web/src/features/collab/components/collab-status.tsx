"use client";

import type { CollabPeer, CollabStatus } from "@/features/collab/use-collab-room";
import { cn } from "@/lib/utils";
import { Users, Wifi, WifiOff } from "lucide-react";

const STATUS_TEXT: Record<CollabStatus, string> = {
  connecting: "连接中…",
  connected: "已连接",
  disconnected: "未连接",
  error: "连接失败",
};

/** 协同连接状态徽标。颜色只做提示，文案才是无障碍读到的内容。 */
export function CollabStatusBadge({ status }: { status: CollabStatus }) {
  const offline = status === "error" || status === "disconnected";
  const Icon = offline ? WifiOff : Wifi;
  return (
    // <output> 的隐式 role 就是 status，与笔记页的保存状态徽标保持一致
    <output
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        status === "connected" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
        status === "connecting" && "border-amber-500/30 bg-amber-500/10 text-amber-600",
        offline && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_TEXT[status]}
    </output>
  );
}

/** 在线成员头像条。自己排第一位并标注「（你）」。 */
export function CollabPresence({ peers }: { peers: CollabPeer[] }) {
  if (peers.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="size-3.5" aria-hidden="true" />
        暂无在线成员
      </span>
    );
  }

  return (
    <ul className="flex items-center gap-1.5" aria-label={`在线成员 ${peers.length} 人`}>
      {peers.map((peer) => (
        <li key={peer.clientId}>
          <span
            title={peer.self ? `${peer.name}（你）` : peer.name}
            className="flex size-7 items-center justify-center rounded-full text-xs font-medium text-white ring-2 ring-background"
            // 颜色来自协同令牌，是运行时值，只能走 CSS 变量注入
            style={{ ["--collab-color" as string]: peer.color }}
          >
            <span className="sr-only">{peer.self ? `${peer.name}（你）` : peer.name}</span>
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-full bg-[var(--collab-color)]"
            >
              {peer.name.slice(0, 1)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
