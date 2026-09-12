// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../[...path]/route";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("openapi-fetch", () => ({ default: vi.fn(() => ({ POST: post })) }));
vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_API_URL: "http://gateway:8080",
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

const fetchMock = vi.fn();

function request(
  path: string,
  init: { method?: string; cookie?: string; headers?: Record<string, string>; body?: string } = {},
) {
  return new NextRequest(`${origin}/api/proxy/${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.cookie ? { cookie: init.cookie } : {}),
      ...init.headers,
    },
    body: init.body ?? null,
  });
}

function context(path: string) {
  return { params: Promise.resolve({ path: path.replace(/^\/api\/proxy\//, "").split("/") }) };
}

function upstreamResponse(body = '{"code":"00000"}', status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
      "content-length": "999",
      "set-cookie": "upstream=leak",
      "x-trace-id": "trace-1",
    },
  });
}

function refreshSuccess() {
  return {
    data: { code: "00000", msg: "操作成功", data: rotated },
    response: new Response(null, { status: 200 }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal("fetch", fetchMock);
  post.mockReset();
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("GET /api/proxy/[...path]", () => {
  it("注入 Bearer 透传路径、查询串与响应", async () => {
    fetchMock.mockResolvedValue(upstreamResponse());
    const response = await GET(
      request("system/user/mine?keyword=%E4%B8%AD&page=1", {
        cookie: `at=${access}; rt=refresh`,
        headers: { "x-custom": "keep-me", "x-forwarded-for": "1.2.3.4" },
      }),
      context("/api/proxy/system/user/mine"),
    );

    const [url, init] = fetchMock.mock.calls.at(0) ?? [];
    expect(url).toBe("http://gateway:8080/api/system/user/mine?keyword=%E4%B8%AD&page=1");
    expect(init.method).toBe("GET");
    expect(init.headers.get("authorization")).toBe(`Bearer ${access}`);
    expect(init.headers.get("x-custom")).toBe("keep-me");
    expect(init.headers.has("cookie")).toBe(false);
    expect(init.headers.has("x-forwarded-for")).toBe(false);
    expect(init.body).toBeNull();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "00000" });
    expect(response.headers.get("x-trace-id")).toBe("trace-1");
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.has("content-length")).toBe(false);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("同源 GET 不要求 Origin 头", async () => {
    fetchMock.mockResolvedValue(upstreamResponse());
    const response = await GET(
      request("system/user/mine", { cookie: `at=${access}` }),
      context("/api/proxy/system/user/mine"),
    );
    expect(response.status).toBe(200);
  });
});

describe("POST /api/proxy/[...path]", () => {
  it("透传请求体与 Content-Type，并校验 Origin", async () => {
    fetchMock.mockResolvedValue(upstreamResponse());
    const response = await POST(
      request("note/notes", {
        method: "POST",
        cookie: `at=${access}`,
        headers: { origin, "content-type": "application/json" },
        body: '{"title":"hello"}',
      }),
      context("/api/proxy/note/notes"),
    );

    const [, init] = fetchMock.mock.calls.at(0) ?? [];
    expect(init.method).toBe("POST");
    expect(init.headers.get("content-type")).toBe("application/json");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"title":"hello"}');
    expect(response.status).toBe(200);
  });

  it("写方法缺失或跨站 Origin 被拒绝", async () => {
    for (const headers of [{}, { origin: "https://untrusted.example" }]) {
      const response = await POST(
        request("note/notes", { method: "POST", cookie: `at=${access}`, headers, body: "{}" }),
        context("/api/proxy/note/notes"),
      );
      expect(response.status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("302 透传（笔记图片的稳定地址）", () => {
  it("上游 302 不 follow：原样透传 Location 与状态码", async () => {
    // 笔记正文存的是 /api/proxy/file/objects/{fileId}/redirect，后端回 302 到新鲜的预签名 URL。
    // 这里必须把 Location 交给浏览器，让它直接去对象存储取图。
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location:
            "http://localhost:9000/anynote/anynote_Shanghai_one/note/1/a.png?X-Amz-Signature=abc",
          "cache-control": "private, max-age=300",
        },
      }),
    );

    const response = await GET(
      request("file/objects/12/redirect", { cookie: `at=${access}` }),
      context("/api/proxy/file/objects/12/redirect"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost:9000/anynote/anynote_Shanghai_one/note/1/a.png?X-Amz-Signature=abc",
    );
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");
    // 关键：redirect 必须是 manual，否则 Node 会自己把对象下载一遍再返回 200
    const [, init] = fetchMock.mock.calls.at(0) ?? [];
    expect(init.redirect).toBe("manual");
    // 上游未返回 content-type，不应被伪造
    expect(response.headers.has("content-type")).toBe(false);
  });

  it("上游 302 不带 Location 时不崩，仍返回 302", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302 }));

    const response = await GET(
      request("file/objects/13/redirect", { cookie: `at=${access}` }),
      context("/api/proxy/file/objects/13/redirect"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBeNull();
  });

  it("非 302 行为不回归：普通 200 JSON 仍剥掉 content-encoding / set-cookie", async () => {
    fetchMock.mockResolvedValue(upstreamResponse());

    const response = await GET(
      request("file/objects/14/redirect", { cookie: `at=${access}` }),
      context("/api/proxy/file/objects/14/redirect"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "00000" });
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe("代理鉴权与刷新", () => {
  it("没有任何 Cookie 时返回 401 并清除两件套", async () => {
    const response = await GET(request("system/user/mine"), context("/api/proxy/system/user/mine"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "A0311" });
    expect(response.cookies.getAll().every((cookie) => cookie.value === "")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("at 收到 401 时刷新并用新凭据重放一次", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{"code":"A0350"}', { status: 401 }))
      .mockResolvedValueOnce(upstreamResponse());
    post.mockResolvedValue(refreshSuccess());
    const response = await GET(
      request("system/user/mine", { cookie: `at=${access}; rt=old-refresh` }),
      context("/api/proxy/system/user/mine"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls.at(1)?.[1];
    expect(retryInit?.headers.get("authorization")).toBe(`Bearer ${rotatedAccess}`);
    expect(response.status).toBe(200);
    expect(response.cookies.get("at")).toMatchObject({ value: rotatedAccess });
    expect(response.cookies.get("rt")).toMatchObject({ value: rotatedRefresh });
  });

  it("仅携带 rt 时先刷新再转发", async () => {
    fetchMock.mockResolvedValue(upstreamResponse());
    post.mockResolvedValue(refreshSuccess());
    const response = await GET(
      request("system/user/mine", { cookie: "rt=old-refresh" }),
      context("/api/proxy/system/user/mine"),
    );

    expect(post).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "http://gateway:8080/api/system/user/mine",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    const forwardedInit = fetchMock.mock.calls.at(0)?.[1];
    expect(forwardedInit?.headers.get("authorization")).toBe(`Bearer ${rotatedAccess}`);
    expect(response.cookies.get("rt")).toMatchObject({ value: rotatedRefresh });
  });

  it("刷新失败时返回 401 并清除 Cookie", async () => {
    fetchMock.mockResolvedValue(new Response('{"code":"A0350"}', { status: 401 }));
    post.mockResolvedValue({
      error: { code: "A0311", msg: "已失效" },
      response: new Response(null, { status: 401 }),
    });
    const response = await GET(
      request("system/user/mine", { cookie: `at=${access}; rt=dead` }),
      context("/api/proxy/system/user/mine"),
    );

    expect(response.status).toBe(401);
    expect(response.cookies.getAll().every((cookie) => cookie.value === "")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("路径包含跳段时直接拒绝", async () => {
    const response = await GET(
      request("system/../etc/passwd", { cookie: `at=${access}` }),
      context("/api/proxy/system/../etc/passwd"),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
