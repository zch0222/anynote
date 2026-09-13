import { consumeCliCode } from "@/lib/auth/cli-code-store";
import { cliExchangeRequestSchema } from "@/lib/auth/cli-schemas";
import { authResponse } from "@/lib/auth/http";
import { decodeJwt } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";

/** RFC 7636 §4.2：`BASE64URL(SHA256(ASCII(code_verifier)))`。 */
export function pkceChallengeOf(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
}

/**
 * 解析 JWT 的到期时间；拿不到就回 null。
 *
 * `decodeJwt` 对畸形串会抛异常，但到期时间只是给 CLI 展示与预刷新的**提示值**——
 * 令牌本身能不能用由网关验签决定。为它让整个兑换失败是本末倒置。
 */
function expiresAtOf(token: string): number | null {
  try {
    const { exp } = decodeJwt(token);
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** 常量时间比较，避免按字节泄露 challenge 前缀。长度不同直接为 false。 */
function sameChallenge(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * CLI 用一次性授权码 + PKCE verifier 换取令牌。
 *
 * 这是整条链路里**唯一**把 Token 交给请求方的出口，因此校验必须严格：
 *
 * 1. `code` 一次性——`consumeCliCode` 取用即删，重放必然失败；
 * 2. **PKCE S256 必校验**——code 若被本机其他进程截获（回环端口抢注），
 *    没有 verifier 也换不走 Token；
 * 3. 失败一律回同一个 `A0301`，不区分"码不存在 / 已用过 / 已过期 / verifier 不匹配"，
 *    避免给攻击者提供"这个码曾经有效"的信号；
 * 4. 响应头 `Cache-Control: no-store`，且**不回显** username——CLI 自己会调
 *    `auth whoami` 确认身份，这里少一处泄露面。
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return authResponse("A0160", "请求体必须是有效 JSON", null, 400);
  }

  const parsed = cliExchangeRequestSchema.safeParse(payload);
  if (!parsed.success) return authResponse("A0160", "请求参数错误", null, 400);

  const entry = consumeCliCode(parsed.data.code);
  if (!entry) return authResponse("A0301", "授权码无效或已过期，请重新登录", null, 401);

  if (!sameChallenge(pkceChallengeOf(parsed.data.codeVerifier), entry.challenge)) {
    // code 已被 consume 消费掉，即使 verifier 错了也无法重试——这是有意的。
    return authResponse("A0301", "授权码无效或已过期，请重新登录", null, 401);
  }

  return authResponse("00000", "操作成功", {
    accessToken: entry.accessToken,
    refreshToken: entry.refreshToken,
    expiresAt: expiresAtOf(entry.accessToken),
    username: entry.username,
  });
}
