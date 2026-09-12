import { VIEW_COOKIE, VIEW_COOKIE_MAX_AGE, resolveViewDecision } from "@/lib/mobile/routing";
import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // 页面层只检查 Cookie 是否存在，真实身份验证由 BFF 与 Gateway 完成。
  if (!request.cookies.get("at")?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 移动端入口分流（M10.1）：只在 `/`、`/dashboard` 上做一次 307，深层路由不改写。
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

  if (decision.setView) {
    // 只存版式偏好、不含身份信息，所以不是 httpOnly；前端要读它显示当前版式。
    // sameSite 用 lax 而不是会话 Cookie 的 strict：它不参与鉴权，跨站跳回来也该保留选择。
    response.cookies.set(VIEW_COOKIE, decision.setView, {
      path: "/",
      maxAge: VIEW_COOKIE_MAX_AGE,
      sameSite: "lax",
      httpOnly: false,
      secure: request.nextUrl.protocol === "https:",
    });
  }

  return response;
}

export const config = {
  // API 自行返回鉴权响应，避免 fetch 收到登录页；其余排除公开页面和静态资源。
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|login(?:/|$)|register(?:/|$)|.*\\..*).*)"],
};
