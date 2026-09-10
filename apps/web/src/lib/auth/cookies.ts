import "server-only";
import type { components } from "@anynote/api-client/src/auth";
import { decodeJwt } from "jose";
import type { NextResponse } from "next/server";

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
} as const;

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
  response.cookies.set("at", token.accessToken, { ...cookieOptions, expires: accessExpires });
  response.cookies.set("rt", token.refreshToken, { ...cookieOptions, expires: refreshExpires });
}

export function clearAuthCookies(response: NextResponse) {
  for (const name of ["at", "rt"]) {
    response.cookies.set(name, "", { ...cookieOptions, expires: new Date(0), maxAge: 0 });
  }
  return response;
}
