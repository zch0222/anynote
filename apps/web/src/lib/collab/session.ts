import { unwrapEnvelope } from "@/lib/api/errors";
import { parseCollabRoom } from "@/lib/collab/rooms";
import { env } from "@/lib/env";
// `yjs` / `y-websocket` 一律**动态**引入（见 `openCollabRoom`）：它们是重依赖，
// 静态引入会被算进笔记路由的首屏图，把 `/notes/[baseId]/[noteId]` 顶出预算
// （仓库禁止清单明确要求这两者 `dynamic(..., { ssr: false })`）。
// 这里只保留类型（编译期擦除，不产生 import）。
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

/**
 * 房间名 → noteId。续期时必须重新告知 BFF 是哪个房间：续期即重查权限（D2），
 * 权限被撤销最迟在令牌过期时生效。
 */
function noteIdFromRoom(room: string): number {
  const parsed = parseCollabRoom(room);
  if (!parsed) throw new Error(`非法协同房间名：${room}`);
  return parsed.noteId;
}

/** 协同令牌的请求体：绑定到具体笔记（方案 §7.1）。 */
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
    // BFF 与网关都会校验 Origin，同源 fetch 由浏览器自动带上
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  });
  return unwrapEnvelope(response, collabTokenSchema.parse);
}

export type CollabSession = {
  doc: Y.Doc;
  provider: WebsocketProvider;
  user: CollabUser;
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
  signal?: AbortSignal;
};

/** 动态加载 `y-websocket` 后建 provider。默认实现放在 async 里，保证它不进首屏图。 */
async function defaultCreateProvider(
  serverUrl: string,
  room: string,
  doc: Y.Doc,
  params: Record<string, string>,
): Promise<WebsocketProvider> {
  const { WebsocketProvider } = await import("y-websocket");
  return new WebsocketProvider(serverUrl, room, doc, {
    params,
    // 跨标签页的 BroadcastChannel 同步保持开启：同一浏览器的多个标签
    // 不必各自等服务端回包就能互相看到编辑。
    disableBc: false,
  });
}

/**
 * 打开一个协同房间：换令牌 → 建连接 → 写入本人 awareness → 起续期定时器。
 *
 * 令牌只有 5 分钟有效期，而 y-websocket 重连时会复用 `provider.params`。
 * 所以这里必须定期把 params.token 换成新的，否则断线重连一定 401。
 */
export async function openCollabRoom(
  room: string,
  options: OpenCollabRoomOptions = {},
): Promise<CollabSession> {
  const fetchToken = options.fetchToken ?? fetchCollabToken;
  const createProvider = options.createProvider ?? defaultCreateProvider;

  const initial = await fetchToken({ noteId: noteIdFromRoom(room) }, options.signal);
  const Y = await import("yjs");
  const doc = new Y.Doc();
  const provider = await createProvider(env.NEXT_PUBLIC_COLLAB_WS_URL, room, doc, {
    token: initial.token,
  });

  provider.awareness.setLocalStateField("user", {
    name: initial.user.name,
    color: initial.user.color,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const scheduleRefresh = (expiresIn: number) => {
    // 有效期太短时至少隔 10 秒再续，避免异常配置把这里变成忙循环。
    const delaySeconds = Math.max(expiresIn - REFRESH_LEAD_SECONDS, 10);
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        const next = await fetchToken({ noteId: noteIdFromRoom(room) });
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
    destroy: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      provider.destroy();
      doc.destroy();
    },
  };
}
