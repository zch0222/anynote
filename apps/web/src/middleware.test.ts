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
    "/api/auth/cli-token",
    "/api/auth/cli-exchange",
    "/api/proxy/note/notes",
    "/_next/static/chunks/app.js",
    "/_next/image?url=/avatar.png",
    "/favicon.ico",
    "/file.svg",
  ])("排除公开页面、API 或静态资源 %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
  });
});

describe("CLI 授权页不受登录中间件保护", () => {
  // 未登录用户必须能落到授权页，由页面自己带着完整参数跳登录页——
  // 走中间件的话重定向不带 next，登录后就回不到授权流程了。
  it.each(["/cli", "/cli/authorize", "/cli/authorize?port=51234&state=s&challenge=c"])(
    "matcher 不覆盖 %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    },
  );

  it("直接调用 middleware 时未登录仍会跳登录页——保护完全靠 matcher 排除", () => {
    // 说明为什么上面那组 matcher 断言是**必要条件**：middleware 函数体本身并不知道
    // 自己被哪条 matcher 覆盖，未登录时它一律跳 /login（且不带 next）。
    // Next 只在 matcher 命中时调用它，所以排除 /cli 才是保护授权页的正确手段。
    const response = middleware(
      new NextRequest("https://notes.example.com/cli/authorize?port=1&state=s&challenge=c"),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://notes.example.com/login");
    // 关键差异：中间件跳转**不携带 next**，登录后就回不到授权页——
    // 因此授权页必须由页面自己带着完整参数跳登录（见 cli/authorize/page.tsx）。
    expect(response.headers.get("location")).not.toContain("next=");
  });
});

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const AUTHED = "at=access-token; rt=refresh-token";

function request(url: string, headers: Record<string, string>) {
  return new NextRequest(url, { headers });
}

describe("移动端入口分流（M10.1）", () => {
  it("手机 UA 访问入口路径 307 到移动端工作台", () => {
    for (const entry of ["/", "/dashboard"]) {
      const response = middleware(
        request(`https://notes.example.com${entry}`, {
          cookie: AUTHED,
          "user-agent": IPHONE_UA,
        }),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://notes.example.com/m/dashboard");
      // UA 判定不落 Cookie：每次都能重新算，写了反而把误判固化下来
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("手机 UA 访问深层路由不跳转——分享链接两端打开同一个页面", () => {
    const response = middleware(
      request("https://notes.example.com/notes/3/7", {
        cookie: AUTHED,
        "user-agent": IPHONE_UA,
      }),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("?desktop=1 逃生：不跳转，并把偏好写进非 httpOnly 的 anynote_view", () => {
    const response = middleware(
      request("https://notes.example.com/dashboard?desktop=1", {
        cookie: AUTHED,
        "user-agent": IPHONE_UA,
      }),
    );
    expect(response.headers.get("location")).toBeNull();
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("anynote_view=desktop");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie.toLowerCase()).not.toContain("httponly");
  });

  it("偏好 Cookie 为 desktop 时手机 UA 也不跳转", () => {
    const response = middleware(
      request("https://notes.example.com/", {
        cookie: `${AUTHED}; anynote_view=desktop`,
        "user-agent": IPHONE_UA,
      }),
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it("偏好 Cookie 为 mobile 时桌面浏览器也进移动版", () => {
    const response = middleware(
      request("https://notes.example.com/", { cookie: `${AUTHED}; anynote_view=mobile` }),
    );
    expect(response.headers.get("location")).toBe("https://notes.example.com/m/dashboard");
  });

  it("未登录时先跳登录页，不做版式分流", () => {
    const response = middleware(request("https://notes.example.com/", { "user-agent": IPHONE_UA }));
    expect(response.headers.get("location")).toBe("https://notes.example.com/login");
  });

  it("http 下不加 Secure，https 下加（本地开发也能记住偏好）", () => {
    const http = middleware(
      request("http://localhost:3000/dashboard?mobile=1", { cookie: AUTHED }),
    );
    expect(http.headers.get("set-cookie")).not.toContain("Secure");
    const https = middleware(
      request("https://notes.example.com/dashboard?mobile=1", { cookie: AUTHED }),
    );
    expect(https.headers.get("set-cookie")).toContain("Secure");
  });
});

describe("中间件 matcher 覆盖移动端路由", () => {
  it.each(["/m", "/m/dashboard", "/m/notes/3/7", "/m/settings/profile"])(
    "保护移动端页面 %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    },
  );
});
