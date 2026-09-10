// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as me } from "../me/route";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("openapi-fetch", () => ({ default: vi.fn(() => ({ POST: post, GET: get })) }));
vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_API_URL: "http://gateway:8080/",
    NEXT_PUBLIC_APP_URL: "https://notes.example.com",
  },
}));

const origin = "https://notes.example.com";
const now = new Date("2026-09-10T00:00:00Z");
function jwt(exp: number) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
}
const access = jwt(Math.floor(now.getTime() / 1000) + 1800);
const rotatedAccess = jwt(Math.floor(now.getTime() / 1000) + 3600);
const rotatedRefresh = jwt(Math.floor(now.getTime() / 1000) + 604800);
const rotated = { accessToken: rotatedAccess, refreshToken: rotatedRefresh };

const minePayload = {
  id: 7,
  username: "tester01",
  nickname: "测试用户",
  avatar: null,
  sex: 0,
  email: "tester@example.com",
  phoneNumber: null,
  role: { id: 1, roleKey: "USER", roleName: "member", extra: "loose" },
  password: "must-not-leak",
  params: { spy: true },
  createBy: 0,
  deleted: 0,
};

function request(cookie?: string) {
  return new NextRequest(`${origin}/api/auth/me`, {
    headers: cookie ? { cookie } : {},
  });
}

function upstream(data: unknown, status = 200) {
  const response = new Response(null, { status });
  return status < 400 ? { data, response } : { error: data, response };
}

function mineSuccess() {
  return upstream({ code: "00000", msg: "操作成功", data: minePayload });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  post.mockReset();
  get.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("GET /api/auth/me", () => {
  it("转发 /user/mine 并按白名单返回资料", async () => {
    get.mockResolvedValue(mineSuccess());
    const response = await me(request(`at=${access}; rt=refresh`));

    expect(get).toHaveBeenCalledExactlyOnceWith("/user/mine", {
      headers: { Authorization: `Bearer ${access}` },
      signal: expect.any(AbortSignal),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      code: "00000",
      msg: "操作成功",
      data: {
        id: 7,
        username: "tester01",
        nickname: "测试用户",
        avatar: null,
        sex: 0,
        email: "tester@example.com",
        phoneNumber: null,
        role: { id: 1, roleKey: "USER", roleName: "member", extra: "loose" },
      },
    });
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("没有任何 Cookie 时返回 401 并清除两件套", async () => {
    const response = await me(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "A0311" });
    expect(response.cookies.getAll().every((cookie) => cookie.value === "")).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });

  it("at 缺失时仅凭 rt 先刷新再拉取资料", async () => {
    post.mockResolvedValue(upstream({ code: "00000", msg: "操作成功", data: rotated }));
    get.mockResolvedValue(mineSuccess());
    const response = await me(request("rt=old-refresh"));

    expect(post).toHaveBeenCalledExactlyOnceWith("/refresh", {
      body: { refreshToken: "old-refresh" },
      signal: expect.any(AbortSignal),
    });
    expect(get).toHaveBeenCalledExactlyOnceWith("/user/mine", {
      headers: { Authorization: `Bearer ${rotatedAccess}` },
      signal: expect.any(AbortSignal),
    });
    expect(response.cookies.get("at")).toMatchObject({ value: rotatedAccess });
    expect(response.cookies.get("rt")).toMatchObject({ value: rotatedRefresh });
  });

  it("at 失效返回 401 时自动刷新并重试一次", async () => {
    get.mockResolvedValueOnce(upstream({ code: "A0350", msg: "token 无效" }, 401));
    post.mockResolvedValue(upstream({ code: "00000", msg: "操作成功", data: rotated }));
    get.mockResolvedValueOnce(mineSuccess());
    const response = await me(request(`at=${access}; rt=old-refresh`));

    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenNthCalledWith(2, "/user/mine", {
      headers: { Authorization: `Bearer ${rotatedAccess}` },
      signal: expect.any(AbortSignal),
    });
    expect(response.status).toBe(200);
    expect(response.cookies.get("rt")).toMatchObject({ value: rotatedRefresh });
  });

  it("刷新也失败时返回 401 并清除 Cookie", async () => {
    get.mockResolvedValue(upstream({ code: "A0350", msg: "token 无效" }, 401));
    post.mockResolvedValue(upstream({ code: "A0311", msg: "已失效" }, 401));
    const response = await me(request(`at=${access}; rt=dead`));

    expect(response.status).toBe(401);
    expect(response.cookies.getAll().every((cookie) => cookie.value === "")).toBe(true);
  });

  it("资料服务瞬时 5xx 不触发刷新且保留 Cookie", async () => {
    get.mockResolvedValue(upstream({ code: "B0001", msg: "服务异常" }, 503));
    const response = await me(request(`at=${access}; rt=refresh`));

    expect(response.status).toBe(502);
    expect(post).not.toHaveBeenCalled();
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
