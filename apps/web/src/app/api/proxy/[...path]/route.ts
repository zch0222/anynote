import { clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies";
import { authResponse, checkOrigin } from "@/lib/auth/http";
import {
  type TokenPair,
  applyRefreshFailure,
  refreshWithLock,
  sessionExpired,
} from "@/lib/auth/refresh";
import { env } from "@/lib/env";
import { type NextRequest, NextResponse } from "next/server";

// 请求头白名单之外全部透传；cookie / authorization 永不进入内部调用。
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "authorization",
  "origin",
  "referer",
  "accept-encoding",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "upgrade",
]);

// undici 会透明解压响应体但保留 Content-Encoding 头，透传前必须剥掉，
// 否则浏览器按头解压一个已解压的流会得到乱码。
const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "connection",
  "transfer-encoding",
  "keep-alive",
  "set-cookie",
]);

type RouteContext = { params: Promise<{ path: string[] }> };

function forwardHeaders(request: NextRequest, bearer: string) {
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase()) && !key.startsWith("x-forwarded-")) {
      headers.set(key, value);
    }
  }
  headers.set("Authorization", `Bearer ${bearer}`);
  return headers;
}

async function forward(url: string, request: NextRequest, bearer: string, body?: ArrayBuffer) {
  // 流式响应（含 M7 的 SSE）原样透传，不设整体超时；按路由超时留待 M7 引入。
  return fetch(url, {
    method: request.method,
    headers: forwardHeaders(request, bearer),
    body: body ?? null,
    redirect: "error",
    cache: "no-store",
  });
}

async function handle(request: NextRequest, context: RouteContext) {
  // GET/HEAD 同源请求可能不带 Origin 头，且 SameSite=Strict 已阻断跨站携带 Cookie；
  // 写请求一律校验 Origin，与 /api/auth/* 保持一致。
  if (request.method !== "GET" && request.method !== "HEAD") {
    const forbidden = checkOrigin(request);
    if (forbidden) return forbidden;
  }

  const { path } = await context.params;
  if (
    path.some(
      (segment) => segment === "" || segment === "." || segment === ".." || /[/\\]/.test(segment),
    )
  ) {
    return authResponse("A0160", "非法的代理路径", null, 400);
  }
  const target = [
    env.INTERNAL_API_URL.replace(/\/$/, ""),
    "api",
    ...path.map((segment) => encodeURIComponent(segment)),
  ].join("/");
  // nextUrl.search 已按原始编码保留查询串，直接拼接即可。
  const url = `${target}${request.nextUrl.search}`;

  let accessToken = request.cookies.get("at")?.value;
  // 缺失的 Cookie 统一成空串，交给与下面守卫互补的类型收窄。
  const refreshToken = request.cookies.get("rt")?.value ?? "";
  if (!accessToken && !refreshToken) return clearAuthCookies(sessionExpired());

  let rotated: TokenPair | undefined;
  // at 过期后浏览器直接删除该 Cookie，此时仅凭 rt 先刷新再转发。
  if (!accessToken) {
    const outcome = await refreshWithLock(refreshToken);
    if (!outcome.ok) return applyRefreshFailure(outcome.response);
    accessToken = outcome.token.accessToken;
    rotated = outcome.token;
  }

  // 请求体缓冲一份以支持 401 刷新后重放；大文件上传走 OSS 直传，不经代理。
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();

  let upstream = await forward(url, request, accessToken, body);
  if (upstream.status === 401 && refreshToken && !rotated) {
    const outcome = await refreshWithLock(refreshToken);
    if (!outcome.ok) return applyRefreshFailure(outcome.response);
    upstream = await forward(url, request, outcome.token.accessToken, body);
    rotated = outcome.token;
  }

  const headers = new Headers();
  for (const [key, value] of upstream.headers) {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  }
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
  if (rotated) setAuthCookies(response, rotated);
  return response;
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
