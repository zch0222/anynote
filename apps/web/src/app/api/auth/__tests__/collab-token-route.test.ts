// @vitest-environment node
import { jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as collabToken } from "../collab-token/route";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("openapi-fetch", () => ({ default: vi.fn(() => ({ POST: post, GET: get })) }));
vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_API_URL: "http://gateway:8080/",
    NEXT_PUBLIC_APP_URL: "https://notes.example.com",
    COLLAB_TOKEN_SECRET: "a-very-long-dev-secret",
  },
}));

const origin = "https://notes.example.com";
const secret = new TextEncoder().encode("a-very-long-dev-secret");
const now = new Date("2026-09-11T00:00:00Z");

function jwt(exp: number) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
}
const access = jwt(Math.floor(now.getTime() / 1000) + 1800);
const rotatedAccess = jwt(Math.floor(now.getTime() / 1000) + 3600);
const rotatedRefresh = jwt(Math.floor(now.getTime() / 1000) + 604800);

function request(cookie?: string, headers: Record<string, string> = { origin }) {
  return new NextRequest(`${origin}/api/auth/collab-token`, {
    method: "POST",
    headers: {
      ...headers,
      ...(cookie ? { cookie } : {}),
    },
  });
}

function upstream(data: unknown, status = 200) {
  const response = new Response(null, { status });
  return status < 400 ? { data, response } : { error: data, response };
}

function mine(overrides: Record<string, unknown> = {}) {
  return upstream({
    code: "00000",
    msg: "操作成功",
    data: {
      id: 7,
      username: "tester01",
      nickname: "测试用户",
      password: "must-not-leak",
      ...overrides,
    },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  post.mockReset();
  get.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("POST /api/auth/collab-token", () => {
  it("签发可被协同服务验签的短期令牌", async () => {
    get.mockResolvedValue(mine());
    const response = await collabToken(request(`at=${access}; rt=refresh`));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.code).toBe("00000");
    expect(body.data.expiresIn).toBe(300);
    expect(body.data.user).toEqual({ id: "7", name: "测试用户", color: expect.any(String) });

    const { payload } = await jwtVerify(body.data.token, secret, {
      issuer: "anynote-web",
      audience: "anynote-collab",
      algorithms: ["HS256"],
    });
    expect(payload.sub).toBe("7");
    expect(payload.name).toBe("测试用户");
    expect(payload.exp).toBe(Math.floor(now.getTime() / 1000) + 300);
  });

  it("令牌与响应都不含 accessToken 或任何后端敏感字段", async () => {
    get.mockResolvedValue(mine());
    const body = await (await collabToken(request(`at=${access}; rt=refresh`))).json();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(access);
    expect(serialized).not.toContain("must-not-leak");
    const { payload } = await jwtVerify(body.data.token, secret);
    expect(payload).not.toHaveProperty("accessToken");
  });

  it("昵称缺失时回落到用户名", async () => {
    get.mockResolvedValue(mine({ nickname: null }));
    const body = await (await collabToken(request(`at=${access}; rt=refresh`))).json();
    expect(body.data.user.name).toBe("tester01");
  });

  it("跨站 Origin 一律 403，且不打上游", async () => {
    const response = await collabToken(request(`at=${access}`, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "A0301" });
    expect(get).not.toHaveBeenCalled();
  });

  it("没有任何会话 Cookie 时 401 并清 Cookie", async () => {
    const response = await collabToken(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "A0311" });
    expect(response.headers.getSetCookie().join(";")).toContain("at=;");
  });

  it("at 缺失但 rt 还在时先刷新再签发，并把新 Cookie 带回", async () => {
    post.mockResolvedValue(
      upstream({
        code: "00000",
        msg: "操作成功",
        data: { accessToken: rotatedAccess, refreshToken: rotatedRefresh },
      }),
    );
    get.mockResolvedValue(mine());

    const response = await collabToken(request("rt=refresh"));

    expect(post).toHaveBeenCalledWith(
      "/refresh",
      expect.objectContaining({ body: { refreshToken: "refresh" } }),
    );
    expect(response.status).toBe(200);
    const cookies = response.headers.getSetCookie().join(";");
    expect(cookies).toContain(`at=${rotatedAccess}`);
    expect(cookies).toContain(`rt=${rotatedRefresh}`);
  });

  it("刷新也失败时把失败响应原样返回", async () => {
    post.mockResolvedValue(upstream({ code: "A0311", msg: "刷新令牌已失效" }, 401));
    const response = await collabToken(request("rt=expired"));
    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
  });

  it("账号缺少用户主键时拒发，而不是编一个身份", async () => {
    get.mockResolvedValue(mine({ id: null }));
    const response = await collabToken(request(`at=${access}`));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "B0400" });
  });

  it("上游不可用时返回 502", async () => {
    get.mockResolvedValue(upstream({ code: "B0400", msg: "系统异常" }, 500));
    const response = await collabToken(request(`at=${access}`));
    expect(response.status).toBe(502);
  });
});
