import "server-only";
import { env } from "@/lib/env";
import type { components } from "@anynote/api-client/src/auth";
import { decodeJwt } from "jose";
import type { NextResponse } from "next/server";

function cookieOptions() {
  // 局域网 HTTP 开发站点无法保存 Secure Cookie；生产部署和 HTTPS 始终保留 Secure。
  // 只信任服务端配置，不依据请求头降级（TLS 可能终止于反向代理）。
  const development = (env.DEPLOYMENT_ENV ?? env.NODE_ENV) === "development";
  return {
    httpOnly: true,
    secure: !(development && new URL(env.NEXT_PUBLIC_APP_URL).protocol === "http:"),
    sameSite: "strict",
    path: "/",
  } as const;
}

type TokenPair = Required<Pick<components["schemas"]["Token"], "accessToken" | "refreshToken">>;

function tokenExpiry(token: string) {
  // 仅解析认证服务刚返回的 JWT 来设置 Cookie 生命周期，验签仍由后端负责。
  const { exp } = decodeJwt(token);
  const expires = new Date(typeof exp === "number" ? exp * 1000 : Number.NaN);
  if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) {
    throw new Error("认证服务返回的 Token 过期时间无效");
  }
  return expires;
}

export function setAuthCookies(response: NextResponse, token: TokenPair) {
  // 两个 Token 都通过校验后才写 Cookie，避免部分成功覆盖现有会话。
  const accessExpires = tokenExpiry(token.accessToken);
  const refreshExpires = tokenExpiry(token.refreshToken);
  response.cookies.set("at", token.accessToken, { ...cookieOptions(), expires: accessExpires });
  response.cookies.set("rt", token.refreshToken, { ...cookieOptions(), expires: refreshExpires });
}

export function clearAuthCookies(response: NextResponse) {
  for (const name of ["at", "rt"]) {
    response.cookies.set(name, "", { ...cookieOptions(), expires: new Date(0), maxAge: 0 });
  }
  return response;
}
