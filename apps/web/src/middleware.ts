import {
  VIEW_COOKIE,
  VIEW_COOKIE_MAX_AGE,
  type ViewPreference,
  readViewOverride,
  resolveViewDecision,
} from "@/lib/mobile/routing";
import { type NextRequest, NextResponse } from "next/server";

/**
 * 对**未登录访客**也开放的页面。
 *
 * 目前只有官网首页 `/`（D-19 / M-14）。它必须在中间件里显式放行：
 * 这一页存在的理由就是"回答访客这是什么、怎么开始"，被登录墙挡住等于没有。
 *
 * `/login`、`/register`、`/cli` 不在这里——它们由 matcher 直接排除，根本走不到本函数。
 */
const PUBLIC_PATHS = new Set(["/"]);

/** 写入版式偏好 Cookie。抽出来是因为「已登录分流」与「访客放行」两条路径都要写。 */
function applyViewCookie(
  response: NextResponse,
  view: ViewPreference | null,
  request: NextRequest,
) {
  if (!view) return response;
  // 只存版式偏好、不含身份信息，所以不是 httpOnly；前端要读它显示当前版式。
  // sameSite 用 lax 而不是会话 Cookie 的 strict：它不参与鉴权，跨站跳回来也该保留选择。
  response.cookies.set(VIEW_COOKIE, view, {
    path: "/",
    maxAge: VIEW_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: false,
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

export function middleware(request: NextRequest) {
  // 页面层只检查 Cookie 是否存在，真实身份验证由 BFF 与 Gateway 完成。
  //
  // 判据是 `at` **或** `rt`：`at` 是带 `expires` 的 Cookie，过期后浏览器会直接删掉它，
  // 而寿命两倍于 `at` 的 `rt` 还在。只认 `at` 的话，「at 过期 + 整页刷新」会被这里
  // 307 到 /login，登录态凭空丢失——移动端整页加载频繁（切后台回来、标签页被杀重开）
  // 最先撞上。仅剩 `rt` 的请求放行到页面后，`/api/auth/me` 会用 `rt` 换新 `at`（见
  // `lib/auth/profile.ts`）；`rt` 也失效时由该端点返回 401，页面自己跳登录页兜底。
  // 注意用 `||` 而不是 `??`：`at=`（空值 Cookie）必须视为「没有 at」落到 rt 上。
  const authed = Boolean(request.cookies.get("at")?.value || request.cookies.get("rt")?.value);

  if (!authed) {
    /*
     * 未登录：公开页放行，其余跳登录。
     *
     * 判断顺序很关键——**先看是不是公开页，再谈版式分流**。反过来的话，手机 UA 的访客
     * 会先被 `resolveViewDecision` 送到 `/m/dashboard`，那一页是受保护的，于是访客看到的是
     * 登录页而不是落地页，公开页也就白做了。
     *
     * 放行时仍要处理 `?desktop=1` / `?mobile=1`：访客在落地页上选过版式，
     * 随后注册登录，那个选择应当生效。
     */
    if (!PUBLIC_PATHS.has(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return applyViewCookie(NextResponse.next(), readViewOverride(request.nextUrl.search), request);
  }

  // 已登录：移动端入口分流（M10.1）——只在 `/`、`/dashboard` 上做一次 307，深层路由不改写。
  // 判定规则全在 lib/mobile/routing.ts 的纯函数里，这里只负责接线与写 Cookie。
  const decision = resolveViewDecision({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    userAgent: request.headers.get("user-agent"),
    viewCookie: request.cookies.get(VIEW_COOKIE)?.value,
  });

  const response = decision.redirectTo
    ? NextResponse.redirect(new URL(decision.redirectTo, request.url))
    : NextResponse.next();

  return applyViewCookie(response, decision.setView, request);
}

export const config = {
  // API 自行返回鉴权响应，避免 fetch 收到登录页；其余排除公开页面和静态资源。
  //
  // `/cli` 也要排除：CLI 授权页必须对**未登录**用户可见，由页面自己带着完整参数
  // （port / state / challenge）跳 `/login?next=...`。走中间件的话重定向不带 next，
  // 用户登录后就回不到授权页，整条 CLI 登录链路断掉。
  //
  // `/`（官网首页）**不排除**：它要经过本函数才能放行访客，也要靠这里做手机 UA 分流。
  matcher: ["/((?!api(?:/|$)|cli(?:/|$)|_next(?:/|$)|login(?:/|$)|register(?:/|$)|.*\\..*).*)"],
};
