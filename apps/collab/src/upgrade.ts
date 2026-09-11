import { type CollabIdentity, isOriginAllowed, verifyCollabToken } from "./auth.ts";
import type { CollabConfig } from "./config.ts";
import { parseHandshake, roomName } from "./rooms.ts";

export type UpgradeDecision =
  | { ok: true; room: string; identity: CollabIdentity }
  | { ok: false; status: number; message: string };

/**
 * WebSocket 握手准入判定。故意做成纯函数（只依赖 url / origin / 配置），
 * 这样连接层的安全边界可以脱离真实 socket 单测。
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

  try {
    const identity = await verifyCollabToken(handshake.token, config.tokenSecret);
    return { ok: true, room: roomName(handshake.room), identity };
  } catch (error) {
    return {
      ok: false,
      status: 401,
      message: error instanceof Error ? error.message : "协同令牌校验失败",
    };
  }
}
