import { randomBytes } from "node:crypto";
import type { paths as AuthPaths } from "@anynote/api-client/src/auth";
import type { paths as SystemPaths } from "@anynote/api-client/src/system";
import createClient from "openapi-fetch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

// 显式运行，连接真实本地栈；不加入无中间件的默认单测流程。
const origin = "http://localhost:3000";
const gateway = "http://localhost:8080";
const bff = createClient<AuthPaths>({ baseUrl: `${origin}/api/auth`, redirect: "manual" });
const auth = createClient<AuthPaths>({ baseUrl: `${gateway}/api/auth`, redirect: "manual" });
const system = createClient<SystemPaths>({ baseUrl: `${gateway}/api/system`, redirect: "manual" });
const account = {
  username: `e2e${randomBytes(5).toString("hex")}`,
  password: `Aa1${randomBytes(6).toString("hex")}`,
  nickname: "认证集成测试临时账号",
  sex: 0,
};
type Pair = { accessToken: string; refreshToken: string };
const sessions: Pair[] = [];
let registered: Awaited<ReturnType<typeof registerAccount>>;
let initial: Pair;

function registerAccount() {
  return bff.POST("/register", { body: account, headers: { origin } });
}

function capture(response: Response): Pair {
  const cookies = response.headers.getSetCookie();
  const accessToken = cookies
    .find((cookie) => cookie.startsWith("at="))
    ?.split(";")[0]
    ?.slice(3);
  const refreshToken = cookies
    .find((cookie) => cookie.startsWith("rt="))
    ?.split(";")[0]
    ?.slice(3);
  if (!accessToken || !refreshToken) throw new Error("BFF 未返回完整 Cookie 两件套");
  const pair = { accessToken, refreshToken };
  sessions.push(pair);
  return pair;
}

function assertCookies(response: Response, cleared = false) {
  const cookies = response.headers.getSetCookie();
  expect(cookies.length).toBe(2);
  for (const cookie of cookies) {
    // 仅断言布尔值，失败输出也不包含凭据。
    for (const attribute of [/; HttpOnly/i, /; Secure/i, /; SameSite=Strict/i, /; Path=\//i]) {
      expect(attribute.test(cookie)).toBe(true);
    }
    expect(/; Domain=/i.test(cookie)).toBe(false);
    if (cleared) {
      expect(/^(at|rt)=;/.test(cookie)).toBe(true);
      expect(/; Max-Age=0/i.test(cookie)).toBe(true);
    } else {
      const expires = /; Expires=([^;]+)/i.exec(cookie)?.[1];
      expect(expires !== undefined && Date.parse(expires) > Date.now()).toBe(true);
    }
  }
  expect(response.headers.get("cache-control")).toBe("no-store");
}

async function assertRevoked(refreshToken: string) {
  const result = await auth.POST("/refresh", { body: { refreshToken } });
  // 如果回归导致仍能刷新，先登记新凭据以便 finally 清理，再报告失败。
  const unexpected = result.data?.data;
  if (unexpected?.accessToken && unexpected.refreshToken) {
    sessions.push({ accessToken: unexpected.accessToken, refreshToken: unexpected.refreshToken });
  }
  expect(result.response.status).toBe(401);
  const failure = z.object({ code: z.string() }).safeParse(result.error);
  expect(failure.success && failure.data.code === "A0311").toBe(true);
}

beforeAll(async () => {
  registered = await registerAccount();
  expect(registered.response.status).toBe(200);
  expect(registered.data?.code).toBe("00000");
  initial = capture(registered.response);
  console.info(`本次临时账号：${account.username}（保留账号，结束时撤销所创建会话）`);
});

afterAll(async () => {
  const results = await Promise.allSettled(
    sessions.map((pair) => auth.POST("/logout", { body: pair })),
  );
  expect(
    results.every((result) => result.status === "fulfilled" && result.value.data?.code === "00000"),
  ).toBe(true);
});

describe.sequential("BFF → Gateway → Auth/System → Redis 真实认证链路", () => {
  it("未登录访问私有页面被重定向到登录页", async () => {
    // 此处只请求前端页面；后端 API 一律通过上述生成契约约束的客户端调用。
    const response = await fetch(`${origin}/dashboard`, { redirect: "manual" });
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location") ?? "", origin).href).toBe(`${origin}/login`);
  });
  it("注册即登录，两枚 Cookie 安全属性完整，JSON 无凭据", () => {
    assertCookies(registered.response);
    expect(registered.data?.data?.username).toBe(account.username);
    expect(Object.keys(registered.data?.data ?? {}).sort()).toEqual([
      "avatar",
      "nickname",
      "role",
      "username",
    ]);
  });

  it("错误密码和重复注册保留业务失败且不写 Cookie", async () => {
    const login = await bff.POST("/login", {
      body: { username: account.username, password: "WrongPassword1" },
      headers: { origin },
    });
    const duplicate = await registerAccount();
    for (const result of [login, duplicate]) {
      expect(result.data?.code === "00000").toBe(false);
      expect(result.response.headers.has("set-cookie")).toBe(false);
    }
  });

  it("缺失或跨站 Origin 的登出请求被拒绝且保留当前会话", async () => {
    for (const headers of [{}, { origin: "https://untrusted.example" }]) {
      const result = await bff.POST("/logout", {
        body: {},
        headers: { ...headers, cookie: `at=${initial.accessToken}; rt=${initial.refreshToken}` },
      });
      expect(result.response.status).toBe(403);
      expect(result.response.headers.has("set-cookie")).toBe(false);
    }
    const mine = await system.GET("/user/mine", {
      headers: { Authorization: `Bearer ${initial.accessToken}` },
    });
    expect(mine.data?.code).toBe("00000");
  });

  it("Gateway 接受 Bearer，拒绝旧 accessToken 头", async () => {
    const legacy = await system.GET("/user/mine", {
      headers: { accessToken: initial.accessToken },
    });
    expect(legacy.response.status).toBe(401);
  });

  it("双 Cookie 登出清除两件套，旧 access 和 refresh 均不可继续使用", async () => {
    const result = await bff.POST("/logout", {
      body: {},
      headers: { origin, cookie: `at=${initial.accessToken}; rt=${initial.refreshToken}` },
    });
    expect(result.data?.code).toBe("00000");
    assertCookies(result.response, true);
    const mine = await system.GET("/user/mine", {
      headers: { Authorization: `Bearer ${initial.accessToken}` },
    });
    expect(mine.data?.code === "00000").toBe(false);
    await assertRevoked(initial.refreshToken);
  });

  it("重新登录后仅携带 rt 也能撤销刷新凭据，不扩大撤销 access", async () => {
    const login = await bff.POST("/login", { body: account, headers: { origin } });
    expect(login.data?.code).toBe("00000");
    const pair = capture(login.response);
    assertCookies(login.response);
    const result = await bff.POST("/logout", {
      body: {},
      headers: { origin, cookie: `rt=${pair.refreshToken}` },
    });
    expect(result.data?.code).toBe("00000");
    assertCookies(result.response, true);
    await assertRevoked(pair.refreshToken);
    const mine = await system.GET("/user/mine", {
      headers: { Authorization: `Bearer ${pair.accessToken}` },
    });
    expect(mine.data?.code).toBe("00000");
  });

  it("没有 Cookie 时幂等登出", async () => {
    const result = await bff.POST("/logout", { body: {}, headers: { origin } });
    expect(result.data?.code).toBe("00000");
    assertCookies(result.response, true);
  });
});
