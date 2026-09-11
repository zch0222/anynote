import { type JWTPayload, jwtVerify } from "jose";

/** 协同令牌的签发方与受众，前后端必须一致，防止别处签的 JWT 被拿来连协同服务。 */
export const COLLAB_TOKEN_ISSUER = "anynote-web";
export const COLLAB_TOKEN_AUDIENCE = "anynote-collab";

/** 协同令牌解出的身份，用于 awareness 里展示「谁在编辑」。 */
export type CollabIdentity = {
  userId: string;
  name: string;
  color: string;
};

export class CollabAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CollabAuthError";
  }
}

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function readIdentity(payload: JWTPayload): CollabIdentity {
  const { sub, name, color } = payload as JWTPayload & { name?: unknown; color?: unknown };
  if (typeof sub !== "string" || sub === "") {
    throw new CollabAuthError("协同令牌缺少用户标识");
  }
  return {
    userId: sub,
    // 昵称只用于展示，缺失时退回到用户标识，不阻断连接。
    name: typeof name === "string" && name.trim() !== "" ? name.trim() : sub,
    color: typeof color === "string" && COLOR_PATTERN.test(color) ? color : "#64748b",
  };
}

export async function verifyCollabToken(token: string, secret: string): Promise<CollabIdentity> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: COLLAB_TOKEN_ISSUER,
      audience: COLLAB_TOKEN_AUDIENCE,
      algorithms: ["HS256"],
    });
    return readIdentity(payload);
  } catch (error) {
    if (error instanceof CollabAuthError) throw error;
    throw new CollabAuthError(error instanceof Error ? error.message : "协同令牌校验失败");
  }
}

/**
 * 校验握手来源。`allowedOrigins` 为空表示不校验（无浏览器参与的本地联调）；
 * 非空时缺 Origin 头也要拒绝——浏览器一定会带，缺失说明不是页面发起的。
 */
export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) return true;
  return origin !== undefined && allowedOrigins.includes(origin);
}
