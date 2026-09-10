// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as refresh } from "../refresh/route";

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
const now = new Date("2026-09-10T00:00:00Z");
const accessExpiry = Math.floor(now.getTime() / 1000) + 1800;
const refreshExpiry = Math.floor(now.getTime() / 1000) + 604800;
function jwt(exp: number) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`;
}
const rotated = { accessToken: jwt(accessExpiry), refreshToken: jwt(refreshExpiry) };

function request(headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/auth/refresh`, {
    method: "POST",
    headers: { origin, ...headers },
    body: "{}",
  });
}

function upstream(data: unknown, status = 200) {
  const response = new Response(null, { status });
  return status < 400 ? { data, response } : { error: data, response };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  post.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("POST /api/auth/refresh", () => {
  it("没有 rt 时返回 401 并清除两件套", async () => {
    const response = await refresh(request({ cookie: "at=stale-access" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "A0311" });
    for (const cookie of response.cookies.getAll()) {
      expect(cookie).toMatchObject({ value: "", maxAge: 0 });
    }
    expect(post).not.toHaveBeenCalled();
  });

  it("跨站 Origin 直接拒绝且不产生副作用", async () => {
    const response = await refresh(request({ origin: "https://untrusted.example" }));
    expect(response.status).toBe(403);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  it("成功后旋转两件套 Cookie", async () => {
    post.mockResolvedValue(upstream({ code: "00000", msg: "操作成功", data: rotated }));
    const response = await refresh(request({ cookie: "at=old; rt=old-refresh" }));

    expect(post).toHaveBeenCalledExactlyOnceWith("/refresh", {
      body: { refreshToken: "old-refresh" },
      signal: expect.any(AbortSignal),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "00000", msg: "操作成功", data: null });
    expect(response.cookies.get("at")).toMatchObject({
      value: rotated.accessToken,
      expires: new Date(accessExpiry * 1000),
    });
    expect(response.cookies.get("rt")).toMatchObject({
      value: rotated.refreshToken,
      expires: new Date(refreshExpiry * 1000),
    });
  });

  it("后端业务失败透传 401 并清除 Cookie", async () => {
    post.mockResolvedValue(upstream({ code: "A0311", msg: "已失效" }, 401));
    const response = await refresh(request({ cookie: "rt=dead" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "A0311" });
    expect(response.cookies.getAll().every((cookie) => cookie.value === "")).toBe(true);
  });

  it("上游瞬时故障保留 Cookie 以便重试", async () => {
    post.mockResolvedValue(upstream({ code: "B0001", msg: "服务异常" }, 503));
    const response = await refresh(request({ cookie: "rt=still-valid" }));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "B0400" });
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("并发刷新共享单飞结果，只打一次后端", async () => {
    let release: (value: ReturnType<typeof upstream>) => void = () => {};
    post.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const pending = Promise.all([
      refresh(request({ cookie: "rt=same" })),
      refresh(request({ cookie: "rt=same" })),
      refresh(request({ cookie: "rt=same" })),
    ]);
    release(upstream({ code: "00000", msg: "操作成功", data: rotated }));
    const responses = await pending;

    expect(post).toHaveBeenCalledTimes(1);
    for (const response of responses) {
      expect(response.cookies.get("rt")).toMatchObject({ value: rotated.refreshToken });
    }
  });
});
