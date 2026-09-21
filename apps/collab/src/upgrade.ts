import { type CollabIdentity, isOriginAllowed, verifyCollabToken } from "./auth.ts";
import type { CollabConfig } from "./config.ts";
import { parseHandshake, roomName } from "./rooms.ts";

/** 握手的只读标志由令牌决定，握手阶段不重算。 */
export type CollabSession = {
  identity: CollabIdentity;
  /** 只读连接：服务端丢弃其写方向消息（D2）。 */
  ro: boolean;
};

export type UpgradeDecision =
  | { ok: true; room: string; session: CollabSession }
  | { ok: false; status: number; message: string };

/**
 * WebSocket 握手准入判定。故意做成纯函数（只依赖 url / origin / 配置），
 * 这样连接层的安全边界可以脱离真实 socket 单测。
 *
 * 三道判定，顺序不能换：
 * 1. 握手 URL 必须带合法房间名与令牌；
 * 2. Origin 必须可信；
 * 3. 令牌必须有效，**且其 `room` claim 与本房间逐字相等**——不符返回 403。
 *    这一步是本次修复越权的关键：旧实现解出令牌就放行，任何登录用户可写任意房间。
 */
export async function authorizeUpgrade(
  url: string | undefined,
  origin: string | undefined,
  config: CollabConfig,
): Promise<UpgradeDecision> {
  const handshake = parseHandshake(url);
  if (!handshake) {
    return { ok: false, status: 400, message: "握手 URL 缺少合法房间名或令牌" };
  }

  if (!isOriginAllowed(origin, config.allowedOrigins)) {
    return { ok: false, status: 403, message: "请求来源不受信任" };
  }

  const canonicalRoom = roomName(handshake.room);
  let claims: Awaited<ReturnType<typeof verifyCollabToken>>;
  try {
    claims = await verifyCollabToken(handshake.token, config.tokenSecret);
  } catch (error) {
    return {
      ok: false,
      status: 401,
      message: error instanceof Error ? error.message : "协同令牌校验失败",
    };
  }

  if (claims.room !== canonicalRoom) {
    return { ok: false, status: 403, message: "协同令牌与房间不匹配" };
  }

  return { ok: true, room: canonicalRoom, session: { identity: claims.identity, ro: claims.ro } };
}
