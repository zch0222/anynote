import { setAuthCookies } from "@/lib/auth/cookies";
import { authResponse } from "@/lib/auth/http";
import { loadSessionProfile } from "@/lib/auth/profile";
import { env } from "@/lib/env";
import { decodeJwt } from "jose";
import type { NextRequest } from "next/server";

/** 桌面端自证身份用的请求头。值来自打包进桌面构建的 DESKTOP_EXCHANGE_KEY。 */
export const DESKTOP_CLIENT_HEADER = "x-anynote-desktop-key";

function desktopOrigins(): string[] {
  return env.DESKTOP_ALLOWED_ORIGINS.split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * 桌面端令牌交换。
 *
 * 背景：桌面壳里 Token 存在 httpOnly Cookie 会有跨进程问题（见 FRONTEND_MILESTONES
 * 风险表 M8.2），因此桌面登录后用这个端点把真实 Token 取出来自己保管，
 * 之后直接带 Bearer 调网关。
 *
 * 这是**整个 BFF 里唯一会把 accessToken 交给 JS 的地方**，三道闸：
 *
 * 1. `DESKTOP_EXCHANGE_KEY` 没配就整体关闭——纯 Web 部署保持关闭，
 *    否则一次 XSS 就能把 Token 取走；
 * 2. Origin 必须在 `DESKTOP_ALLOWED_ORIGINS` 里（Web 页面的 Origin 不在其中）；
 * 3. 仍然要求有效会话 Cookie。
 *
 * 密钥打包在桌面二进制里、理论上可被逆向取出，所以它挡的是「浏览器里的脚本」，
 * 真正的边界是 Origin 校验；两者缺一不可。
 */
export async function POST(request: NextRequest) {
  const expectedKey = env.DESKTOP_EXCHANGE_KEY;
  if (!expectedKey) {
    return authResponse("A0301", "桌面令牌交换未启用", null, 403);
  }

  const presented = request.headers.get(DESKTOP_CLIENT_HEADER);
  if (presented !== expectedKey) {
    return authResponse("A0301", "桌面客户端标识无效", null, 403);
  }

  const origin = request.headers.get("origin");
  if (!origin || !desktopOrigins().includes(origin)) {
    return authResponse("A0301", "请求来源不受信任", null, 403);
  }

  const outcome = await loadSessionProfile(request);
  if (!outcome.ok) return outcome.response;

  // loadSessionProfile 只在刷新过时才回传 token；否则用请求里带的那一对。
  const accessToken = outcome.rotated?.accessToken ?? request.cookies.get("at")?.value;
  const refreshToken = outcome.rotated?.refreshToken ?? request.cookies.get("rt")?.value;
  if (!accessToken || !refreshToken) {
    return authResponse("A0311", "登录状态已过期，请重新登录", null, 401);
  }

  // 只解析自家认证服务签发的 JWT 取到期时间，验签仍由网关负责。
  const { exp } = decodeJwt(accessToken);
  const expiresAt = typeof exp === "number" ? exp * 1000 : null;

  const response = authResponse("00000", "操作成功", {
    accessToken,
    refreshToken,
    expiresAt,
    user: { id: outcome.profile.id ?? null, nickname: outcome.profile.nickname ?? null },
  });
  if (outcome.rotated) setAuthCookies(response, outcome.rotated);
  return response;
}
