import { setAuthCookies } from "@/lib/auth/cookies";
import { authResponse, checkOrigin } from "@/lib/auth/http";
import { loadSessionProfile } from "@/lib/auth/profile";
import {
  COLLAB_TOKEN_AUDIENCE,
  COLLAB_TOKEN_ISSUER,
  COLLAB_TOKEN_TTL_SECONDS,
  collabUserColor,
  collabUserName,
} from "@/lib/collab/identity";
import { env } from "@/lib/env";
import { SignJWT } from "jose";
import type { NextRequest } from "next/server";

/**
 * 签发协同服务专用的短期令牌。
 *
 * 为什么不直接把 accessToken 给浏览器：它是 httpOnly Cookie，前端 JS 永远拿不到，
 * 而浏览器的 WebSocket 构造函数又没法自定义请求头。所以这里换一枚**另一套密钥签的**、
 * 五分钟有效、只被协同服务认的令牌——泄露了也调不动 Gateway 上的任何业务接口。
 */
export async function POST(request: NextRequest) {
  const forbidden = checkOrigin(request);
  if (forbidden) return forbidden;

  const outcome = await loadSessionProfile(request);
  if (!outcome.ok) return outcome.response;

  const { profile } = outcome;
  if (profile.id === null || profile.id === undefined) {
    // 没有用户主键就无法给协同服务一个稳定身份，宁可拒发也不编一个。
    return authResponse("B0400", "当前账号缺少用户标识，无法加入协同", null, 502);
  }

  const userId = String(profile.id);
  const name = collabUserName(profile);
  const color = collabUserColor(userId);

  const token = await new SignJWT({ name, color })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(COLLAB_TOKEN_ISSUER)
    .setAudience(COLLAB_TOKEN_AUDIENCE)
    .setSubject(userId)
    .setExpirationTime(`${COLLAB_TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(env.COLLAB_TOKEN_SECRET));

  const response = authResponse("00000", "操作成功", {
    token,
    expiresIn: COLLAB_TOKEN_TTL_SECONDS,
    user: { id: userId, name, color },
  });
  // 取资料时顺带刷新过 Token 的话，把新 Cookie 一起带回去。
  if (outcome.rotated) setAuthCookies(response, outcome.rotated);
  return response;
}
