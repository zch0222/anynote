// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_CLIENT_HEADER, POST as exchange } from "../exchange/route";

const { post, get, envMock } = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  envMock: {
    INTERNAL_API_URL: "http://gateway:8080/",
    NEXT_PUBLIC_APP_URL: "https://notes.example.com",
    COLLAB_TOKEN_SECRET: "a-very-long-dev-secret",
    DESKTOP_EXCHANGE_KEY: "a-very-long-desktop-key" as string | undefined,
    DESKTOP_ALLOWED_ORIGINS: "tauri://localhost,http://tauri.localhost",
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("openapi-fetch", () => ({ default: vi.fn(() => ({ POST: post, GET: get })) }));
vi.mock("@/lib/env", () => ({ env: envMock }));

const desktopOrigin = "tauri://localhost";
const now = new Date("2026-09-11T00:00:00Z");
const accessExp = Math.floor(now.getTime() / 1000) + 1800;

function jwt(exp: number) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
}
const access = jwt(accessExp);
const rotatedAccess = jwt(accessExp + 1800);
const rotatedRefresh = jwt(accessExp + 604800);

function request(options: { cookie?: string; origin?: string | null; key?: string | null } = {}) {
  const {
    cookie = `at=${access}; rt=refresh`,
    origin = desktopOrigin,
    key = "a-very-long-desktop-key",
  } = options;
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  if (key) headers[DESKTOP_CLIENT_HEADER] = key;
  if (cookie) headers.cookie = cookie;
  return new NextRequest("https://notes.example.com/api/auth/exchange", {
    method: "POST",
    headers,
  });
}

function upstream(data: unknown, status = 200) {
  const response = new Response(null, { status });
  return status < 400 ? { data, response } : { error: data, response };
}

function mine() {
  return upstream({
    code: "00000",
    msg: "操作成功",
    data: { id: 7, username: "tester01", nickname: "测试用户", password: "must-not-leak" },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  post.mockReset();
  get.mockReset();
  envMock.DESKTOP_EXCHANGE_KEY = "a-very-long-desktop-key";
  envMock.DESKTOP_ALLOWED_ORIGINS = "tauri://localhost,http://tauri.localhost";
});
afterEach(() => vi.useRealTimers());

describe("POST /api/auth/exchange", () => {
  it("三道闸全过时返回真实 Token 与到期时间", async () => {
    get.mockResolvedValue(mine());
    const response = await exchange(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      code: "00000",
      msg: "操作成功",
      data: {
        accessToken: access,
        refreshToken: "refresh",
        expiresAt: accessExp * 1000,
        user: { id: 7, nickname: "测试用户" },
      },
    });
  });

  it("未配置 DESKTOP_EXCHANGE_KEY 时整体关闭（纯 Web 部署的默认姿态）", async () => {
    envMock.DESKTOP_EXCHANGE_KEY = undefined;
    const response = await exchange(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ msg: "桌面令牌交换未启用" });
    expect(get).not.toHaveBeenCalled();
  });

  it("客户端密钥不符或缺失时 403，且不打上游", async () => {
    expect((await exchange(request({ key: "wrong-but-long-enough" }))).status).toBe(403);
    expect((await exchange(request({ key: null }))).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it("Web 页面的 Origin 不在桌面白名单里，一律 403", async () => {
    const response = await exchange(request({ origin: "https://notes.example.com" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ msg: "请求来源不受信任" });
    expect(get).not.toHaveBeenCalled();
  });

  it("缺 Origin 头（脚本化请求）也拒绝", async () => {
    expect((await exchange(request({ origin: null }))).status).toBe(403);
  });

  it("白名单里的其他桌面来源同样放行", async () => {
    get.mockResolvedValue(mine());
    expect((await exchange(request({ origin: "http://tauri.localhost" }))).status).toBe(200);
  });

  it("没有会话 Cookie 时 401", async () => {
    const response = await exchange(request({ cookie: "" }));
    expect(response.status).toBe(401);
  });

  it("交换过程中刷新了 Token，返回新的那一对并回种 Cookie", async () => {
    post.mockResolvedValue(
      upstream({
        code: "00000",
        msg: "操作成功",
        data: { accessToken: rotatedAccess, refreshToken: rotatedRefresh },
      }),
    );
    get.mockResolvedValue(mine());

    const response = await exchange(request({ cookie: "rt=refresh" }));

    const body = await response.json();
    expect(body.data.accessToken).toBe(rotatedAccess);
    expect(body.data.refreshToken).toBe(rotatedRefresh);
    expect(response.headers.getSetCookie().join(";")).toContain(`at=${rotatedAccess}`);
  });

  it("不透传后端资料里的敏感字段", async () => {
    get.mockResolvedValue(mine());
    const body = await (await exchange(request())).json();

    expect(JSON.stringify(body)).not.toContain("must-not-leak");
    expect(body.data.user).toEqual({ id: 7, nickname: "测试用户" });
  });

  it("上游不可用时返回 502，不吐出任何 Token", async () => {
    get.mockResolvedValue(upstream({ code: "B0400", msg: "系统异常" }, 500));
    const response = await exchange(request());

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain(access);
  });
});
