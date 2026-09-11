import { unwrapEnvelope } from "@/lib/api/errors";
import { env } from "@/lib/env";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
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

/** 向 BFF 换一枚协同令牌。accessToken 仍在 httpOnly Cookie 里，前端全程拿不到它。 */
export async function fetchCollabToken(signal?: AbortSignal): Promise<CollabToken> {
  const response = await fetch("/api/auth/collab-token", {
    method: "POST",
    credentials: "same-origin",
    // BFF 与网关都会校验 Origin，同源 fetch 由浏览器自动带上
    headers: { "content-type": "application/json" },
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
  ) => WebsocketProvider;
  fetchToken?: (signal?: AbortSignal) => Promise<CollabToken>;
  signal?: AbortSignal;
};

function defaultCreateProvider(
  serverUrl: string,
  room: string,
  doc: Y.Doc,
  params: Record<string, string>,
) {
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

  const initial = await fetchToken(options.signal);
  const doc = new Y.Doc();
  const provider = createProvider(env.NEXT_PUBLIC_COLLAB_WS_URL, room, doc, {
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
        const next = await fetchToken();
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
