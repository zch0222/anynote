// @vitest-environment node
import { NextRequest } from "next/server";
import createClient from "openapi-fetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "../login/route";
import { POST as logout } from "../logout/route";
import { POST as register } from "../register/route";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("openapi-fetch", () => ({ default: vi.fn(() => ({ POST: post })) }));
vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_API_URL: "http://gateway:8080/",
    NEXT_PUBLIC_APP_URL: "https://notes.example.com",
  },
}));

const origin = "https://notes.example.com";
const now = new Date("2026-09-08T00:00:00Z");
const accessExpiry = Math.floor(now.getTime() / 1000) + 1800;
const refreshExpiry = Math.floor(now.getTime() / 1000) + 604800;
function jwt(exp: unknown) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
}
const token = { accessToken: jwt(accessExpiry), refreshToken: jwt(refreshExpiry) };
const profile = { username: "tester01", nickname: "测试用户", avatar: null, role: "USER" };
const loginBody = { username: "tester01", password: "Password1" };
const registerBody = { ...loginBody, nickname: "测试用户", sex: 0 };

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function upstream(data: unknown, status = 200) {
  const response = new Response(null, {
    status,
    headers: { "Set-Cookie": "upstream=secret", "X-Internal-Token": "secret" },
  });
  return status < 400 ? { data, response } : { error: data, response };
}

function success() {
  return upstream({
    code: "00000",
    msg: "操作成功",
    data: { ...profile, token, password: "must-not-leak", extra: { token } },
  });
}

function expectCleared(response: Awaited<ReturnType<typeof logout>>) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.cookies.getAll().map((cookie) => cookie.name)).toEqual(["at", "rt"]);
  for (const cookie of response.cookies.getAll()) {
    expect(cookie).toMatchObject({
      value: "",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  post.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("BFF 服务端客户端", () => {
  it("使用 Gateway 各服务前缀并禁用缓存及重定向", async () => {
    vi.resetModules();
    await import("@/lib/auth/backend");
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(createClient).toHaveBeenNthCalledWith(1, {
      baseUrl: "http://gateway:8080/api/auth",
      cache: "no-store",
      redirect: "error",
    });
    expect(createClient).toHaveBeenNthCalledWith(2, {
      baseUrl: "http://gateway:8080/api/system",
      cache: "no-store",
      redirect: "error",
    });
  });
});

describe.each([
  { path: "login", handler: login, body: loginBody },
  { path: "register", handler: register, body: registerBody },
])("POST /api/auth/$path", ({ path, handler, body }) => {
  it("调用 typed client，设置两件套且只返回公开资料", async () => {
    post.mockResolvedValue(success());
    const response = await handler(
      request(
        path,
        { ...body, accessToken: "forged" },
        {
          cookie: "at=old-access; rt=old-refresh",
          Authorization: "Bearer forged",
        },
      ),
    );

    expect(post).toHaveBeenCalledExactlyOnceWith(`/${path}`, {
      body,
      signal: expect.any(AbortSignal),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "00000", msg: "操作成功", data: profile });
    expect(response.cookies.getAll().map((cookie) => cookie.name)).toEqual(["at", "rt"]);
    expect(response.cookies.get("at")).toMatchObject({
      value: token.accessToken,
      expires: new Date(accessExpiry * 1000),
    });
    expect(response.cookies.get("rt")).toMatchObject({
      value: token.refreshToken,
      expires: new Date(refreshExpiry * 1000),
    });
    for (const cookie of response.cookies.getAll()) {
      expect(cookie).toMatchObject({ path: "/", httpOnly: true, secure: true, sameSite: "strict" });
      expect(cookie).not.toHaveProperty("domain");
    }
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(
      response.headers
        .getSetCookie()
        .every(
          (value) =>
            value.includes("HttpOnly") &&
            value.includes("Secure") &&
            value.includes("SameSite=strict"),
        ),
    ).toBe(true);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-internal-token")).toBeNull();
  });

  it.each([
    "https://evil.example.com",
    "https://notes.example.com.evil.test",
    "null",
    "",
    "http://notes.example.com",
    "https://notes.example.com:444",
  ])("拒绝不匹配的 Origin %s，不发起后端请求或设置 Cookie", async (untrustedOrigin) => {
    const response = await handler(request(path, body, { origin: untrustedOrigin }));
    expect(response.status).toBe(403);
    expect(post).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("拒绝缺少 Origin 的请求", async () => {
    const input = request(path, body);
    input.headers.delete("origin");
    expect((await handler(input)).status).toBe(403);
    expect(post).not.toHaveBeenCalled();
  });

  it("拒绝损坏的 JSON", async () => {
    const response = await handler(
      new Request(`${origin}/api/auth/${path}`, {
        method: "POST",
        headers: { origin },
        body: "{broken",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("A0160");
    expect(post).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, { ...body, password: 123 }])("拒绝不合法的请求体 %j", async (input) => {
    const response = await handler(request(path, input));
    expect(response.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([200, 401, 403])("保留后端业务失败（HTTP %s），丢弃错误 data", async (status) => {
    post.mockResolvedValue(
      upstream({ code: "A0201", msg: "账号或密码错误", data: { token } }, status),
    );
    const response = await handler(request(path, body));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code: "A0201", msg: "账号或密码错误", data: null });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("失败响应缺少 msg 时提供可展示的消息", async () => {
    post.mockResolvedValue(upstream({ code: "A0201" }));
    const response = await handler(request(path, body));
    expect(await response.json()).toEqual({ code: "A0201", msg: "认证请求失败", data: null });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("HTTP 失败即使携带成功码也不能建立会话", async () => {
    post.mockResolvedValue(upstream({ code: "00000", data: { ...profile, token } }, 401));
    const response = await handler(request(path, body));
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    null,
    {},
    { code: "00000", data: null },
    { code: "00000", data: { ...profile } },
    { code: "00000", data: { token: { accessToken: token.accessToken } } },
    { code: "00000", data: { token: { ...token, refreshToken: "malformed" } } },
    { code: "00000", data: { token: { ...token, accessToken: jwt(0) } } },
  ])("后端响应不完整或 Token 无效时不覆盖现有 Cookie（%j）", async (data) => {
    post.mockResolvedValue(upstream(data));
    const response = await handler(request(path, body));
    expect(response.status).toBe(502);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect((await response.json()).data).toBeNull();
  });

  it("网络错误或超时返回 502，保留当前会话且不泄露异常文本", async () => {
    post.mockRejectedValue(new Error("network failure with secret-token"));
    const response = await handler(request(path, body));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret-token");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("后端 5xx 统一返回 502，不转发服务内部信息", async () => {
    post.mockResolvedValue(upstream({ code: "B0001", msg: "internal stack", data: token }, 503));
    const response = await handler(request(path, body));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("internal stack");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("注册 DTO 边界", () => {
  it.each([
    { username: "abc12" },
    { username: "abcdefghijklmnop" },
    { username: "user_01" },
    { password: "password1" },
    { password: "PASSWORD1" },
    { password: "Password" },
    { password: "Abc1234" },
    { password: "Abc1234567890123" },
    { nickname: null },
    { sex: -1 },
    { sex: 2 },
    { sex: "0" },
    { email: "invalid" },
  ])("拒绝与后端约束不符的字段 %j", async (override) => {
    const response = await register(request("register", { ...registerBody, ...override }));
    expect(response.status).toBe(400);
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    { username: "abc123", password: "Abc12345", sex: 0 },
    { username: "abcdefghijklmno", password: "Abc123456789012", sex: 1, email: "a@example.com" },
    { email: "" },
  ])("接受边界值与可选 email，保持字段值不变 %j", async (override) => {
    post.mockResolvedValue(success());
    const body = { ...registerBody, ...override };
    expect((await register(request("register", body))).status).toBe(200);
    expect(post).toHaveBeenCalledWith("/register", { body, signal: expect.any(AbortSignal) });
  });
});

describe("POST /api/auth/logout", () => {
  it.each([
    {
      cookie: "at=current-access; rt=current-refresh",
      body: { accessToken: "current-access", refreshToken: "current-refresh" },
    },
    { cookie: "at=current-access", body: { accessToken: "current-access" } },
  ])("只撤销 Cookie 指定的当前会话（$cookie）", async ({ cookie, body }) => {
    post.mockResolvedValue(upstream({ code: "00000", data: { token } }));
    const response = await logout(
      request("logout", { accessToken: "another-session" }, { cookie }),
    );
    expect(post).toHaveBeenCalledExactlyOnceWith("/logout", {
      body,
      signal: expect.any(AbortSignal),
    });
    expectCleared(response);
    expect(await response.json()).toEqual({ code: "00000", msg: "操作成功", data: null });
  });

  it("没有 Cookie 时幂等清除本地状态", async () => {
    const response = await logout(request("logout", {}));
    expectCleared(response);
    expect(response.status).toBe(200);
    expect(post).not.toHaveBeenCalled();
  });

  it("只有 rt 时撤销该 refreshToken，不伪造 at 或触发刷新", async () => {
    post.mockResolvedValue(upstream({ code: "00000", data: null }));
    const response = await logout(request("logout", {}, { cookie: "rt=current-refresh" }));
    expectCleared(response);
    expect(response.status).toBe(200);
    expect((await response.json()).code).toBe("00000");
    expect(post).toHaveBeenCalledExactlyOnceWith("/logout", {
      body: { refreshToken: "current-refresh" },
      signal: expect.any(AbortSignal),
    });
  });

  it("跨站请求不能登出用户或清 Cookie", async () => {
    const response = await logout(
      request("logout", {}, { cookie: "at=current", origin: "https://evil.example.com" }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("网络失败仍清除两件套，响应明确报告撤销未成功", async () => {
    post.mockRejectedValue(new Error("failed"));
    const response = await logout(request("logout", {}, { cookie: "at=current; rt=current-rt" }));
    expectCleared(response);
    expect(response.status).toBe(502);
  });

  it("后端业务失败仍清 Cookie，同时保留失败码", async () => {
    post.mockResolvedValue(upstream({ code: "B0001", msg: "撤销失败", data: token }));
    const response = await logout(request("logout", {}, { cookie: "at=current" }));
    expectCleared(response);
    expect(await response.json()).toEqual({ code: "B0001", msg: "撤销失败", data: null });
  });
});
