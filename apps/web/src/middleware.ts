import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // 页面层只检查 Cookie 是否存在，真实身份验证由 BFF 与 Gateway 完成。
  if (!request.cookies.get("at")?.value) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // API 自行返回鉴权响应，避免 fetch 收到登录页；其余排除公开页面和静态资源。
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|login(?:/|$)|register(?:/|$)|.*\\..*).*)"],
};
