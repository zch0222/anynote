// @vitest-environment node
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "./middleware";

describe("页面路由保护", () => {
  it.each([undefined, "at=", "rt=refresh-only", "sid=legacy-session"])(
    "缺少非空 at 时跳转登录页（Cookie: %s）",
    (cookie) => {
      const request = new NextRequest("https://notes.example.com/notes?base=1", {
        headers: cookie ? { cookie } : {},
      });
      const response = middleware(request);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://notes.example.com/login");
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("携带 at 时继续交给页面和后端鉴权，不将 Cookie 复制到响应", () => {
    const response = middleware(
      new NextRequest("https://notes.example.com/dashboard", {
        headers: { cookie: "at=access-token; rt=refresh-token" },
      }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("中间件 matcher", () => {
  it.each(["/", "/dashboard", "/notes/1", "/settings/profile", "/login-help", "/apiary"])(
    "保护私有页面 %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    },
  );

  it.each([
    "/login",
    "/login?next=/dashboard",
    "/register",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/proxy/note/notes",
    "/_next/static/chunks/app.js",
    "/_next/image?url=/avatar.png",
    "/favicon.ico",
    "/file.svg",
  ])("排除公开页面、API 或静态资源 %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });
});
