// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, loadSessionProfile, consumeCliCode, issueCliCode, clearCliCodes } = vi.hoisted(
  () => ({
    post: vi.fn(),
    loadSessionProfile: vi.fn(),
    consumeCliCode: vi.fn(),
    issueCliCode: vi.fn(),
    clearCliCodes: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/backend", () => ({ authClient: { POST: post } }));
vi.mock("@/lib/auth/profile", () => ({ loadSessionProfile }));
vi.mock("@/lib/auth/cli-code-store", () => ({ consumeCliCode, issueCliCode, clearCliCodes }));
vi.mock("@/lib/env", () => ({
  env: {
    INTERNAL_API_URL: "http://gateway:8080/",
    NEXT_PUBLIC_APP_URL: "https://notes.example.com",
  },
}));

import { POST as cliExchange, pkceChallengeOf } from "../cli-exchange/route";
import { POST as cliToken } from "../cli-token/route";

const origin = "https://notes.example.com";
const codeChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const state = "state-value";

function request(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  cookie = "at=at-1; rt=rt-1",
) {
  return new NextRequest(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function upstream(data: unknown, status = 200) {
  const response = new Response(null, { status });
  return status < 400 ? { data, response } : { error: data, response };
}

const authorized = () => ({
  ok: true as const,
  profile: { id: 7, username: "alice", nickname: "小爱" },
  rotated: undefined,
});

beforeEach(() => {
  vi.clearAllMocks();
  loadSessionProfile.mockResolvedValue(authorized());
  issueCliCode.mockReturnValue("generated-code");
  consumeCliCode.mockReturnValue(null);
});

describe("POST /api/auth/cli-token", () => {
  it("已登录时返回授权码与回环跳转地址，且响应体不含 Token", async () => {
    post.mockResolvedValue(
      upstream({
        code: "00000",
        msg: "操作成功",
        data: {
          username: "alice",
          nickname: "小爱",
          token: { accessToken: "cli-at-secret", refreshToken: "cli-rt-secret" },
        },
      }),
    );

    const response = await cliToken(request("cli-token", { port: 51234, state, codeChallenge }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: "00000",
      data: {
        code: "generated-code",
        state,
        redirectTo: `http://127.0.0.1:51234/callback?code=generated-code&state=${state}`,
      },
    });
    // 整份响应里不能出现任何真令牌
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("cli-at-secret");
    expect(serialized).not.toContain("cli-rt-secret");
    expect(response.headers.get("cache-control")).toBe("no-store");

    // 令牌只进服务端内存，与 code 绑定
    expect(issueCliCode).toHaveBeenCalledExactlyOnceWith({
      username: "alice",
      challenge: codeChallenge,
      accessToken: "cli-at-secret",
      refreshToken: "cli-rt-secret",
    });
  });

  it("调用后端时带上会话 Cookie 的 Bearer，而不是请求体里的任何东西", async () => {
    post.mockResolvedValue(
      upstream({
        code: "00000",
        data: { username: "alice", token: { accessToken: "at", refreshToken: "rt" } },
      }),
    );

    await cliToken(request("cli-token", { port: 51234, state, codeChallenge }));

    expect(post).toHaveBeenCalledExactlyOnceWith("/cli/token", {
      headers: { Authorization: "Bearer at-1" },
      signal: expect.any(AbortSignal),
    });
  });

  it("刷新过会话时用新 Token 调后端，并把新 Cookie 带回", async () => {
    const now = Math.floor(Date.now() / 1000);
    const jwt = (exp: number) =>
      `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;
    loadSessionProfile.mockResolvedValue({
      ok: true,
      profile: { id: 7, username: "alice" },
      rotated: { accessToken: jwt(now + 1800), refreshToken: jwt(now + 604800) },
    });
    post.mockResolvedValue(
      upstream({
        code: "00000",
        data: { username: "alice", token: { accessToken: "at", refreshToken: "rt" } },
      }),
    );

    const response = await cliToken(request("cli-token", { port: 51234, state, codeChallenge }));

    expect(post.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: expect.stringMatching(/^Bearer ey/) },
    });
    expect(response.headers.getSetCookie()).toHaveLength(2);
  });

  it("未登录时回 401 且不签发授权码（前端据此跳登录页）", async () => {
    const { NextResponse } = await import("next/server");
    loadSessionProfile.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ code: "A0311", msg: "登录状态已过期" }, { status: 401 }),
    });

    const response = await cliToken(request("cli-token", { port: 51234, state, codeChallenge }));

    expect(response.status).toBe(401);
    expect(issueCliCode).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("跨源请求被拒（CSRF）", async () => {
    const response = await cliToken(
      request(
        "cli-token",
        { port: 51234, state, codeChallenge },
        { origin: "https://evil.example" },
      ),
    );
    expect(response.status).toBe(403);
    expect(issueCliCode).not.toHaveBeenCalled();
  });

  it.each([
    ["非回环端口", { port: 80, state, codeChallenge }],
    ["超范围端口", { port: 70000, state, codeChallenge }],
    ["state 含非法字符", { port: 51234, state: "has space", codeChallenge }],
    ["challenge 为空", { port: 51234, state, codeChallenge: "" }],
    ["challenge 过长", { port: 51234, state, codeChallenge: "a".repeat(129) }],
    ["缺少字段", { port: 51234 }],
  ])("参数非法（%s）时回 400，不落任何状态", async (_label, body) => {
    const response = await cliToken(request("cli-token", body));
    expect(response.status).toBe(400);
    expect(issueCliCode).not.toHaveBeenCalled();
  });

  it("请求体不是 JSON 时回 400", async () => {
    const bad = new NextRequest(`${origin}/api/auth/cli-token`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "not-json",
    });
    expect((await cliToken(bad)).status).toBe(400);
  });

  it("后端返回业务错误时原样透传，不签发授权码", async () => {
    post.mockResolvedValue(upstream({ code: "A0300", msg: "访问权限异常" }, 200));
    const response = await cliToken(request("cli-token", { port: 51234, state, codeChallenge }));
    expect(await response.json()).toMatchObject({ code: "A0300" });
    expect(issueCliCode).not.toHaveBeenCalled();
  });

  it("后端响应缺少 token 时回 502，不签发授权码", async () => {
    post.mockResolvedValue(upstream({ code: "00000", data: { username: "alice" } }));
    const response = await cliToken(request("cli-token", { port: 51234, state, codeChallenge }));
    expect(response.status).toBe(502);
    expect(issueCliCode).not.toHaveBeenCalled();
  });

  it("后端抛异常时回 502，不泄露内部细节", async () => {
    post.mockRejectedValue(new Error("connection refused to 172.19.0.11"));
    const response = await cliToken(request("cli-token", { port: 51234, state, codeChallenge }));
    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("172.19.0.11");
  });
});

describe("POST /api/auth/cli-exchange", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

  function exchangeRequest(body: unknown) {
    return new Request(`${origin}/api/auth/cli-exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("授权码 + 正确 verifier 时交出令牌", async () => {
    consumeCliCode.mockReturnValue({
      username: "alice",
      challenge: pkceChallengeOf(verifier),
      accessToken: "cli-at",
      refreshToken: "cli-rt",
      expiresAt: Date.now() + 60_000,
    });

    const response = await cliExchange(
      exchangeRequest({ code: "the-code", codeVerifier: verifier }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      code: "00000",
      data: { accessToken: "cli-at", refreshToken: "cli-rt", username: "alice" },
    });
    // 一次性：取用即删（服务端已消费，这里断言调用发生）
    expect(consumeCliCode).toHaveBeenCalledExactlyOnceWith("the-code");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("verifier 与 challenge 不匹配时拒绝，且不回显 Token", async () => {
    consumeCliCode.mockReturnValue({
      username: "alice",
      challenge: pkceChallengeOf("another-verifier-entirely-000000000000000000"),
      accessToken: "cli-at",
      refreshToken: "cli-rt",
      expiresAt: Date.now() + 60_000,
    });

    const response = await cliExchange(
      exchangeRequest({ code: "the-code", codeVerifier: verifier }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(JSON.stringify(body)).not.toContain("cli-at");
    expect(body).toMatchObject({ code: "A0301" });
  });

  it("授权码不存在或已过期时回同一个错误，不泄露码是否曾经有效", async () => {
    consumeCliCode.mockReturnValue(null);
    const missing = await cliExchange(exchangeRequest({ code: "nope", codeVerifier: verifier }));

    consumeCliCode.mockReturnValue({
      username: "alice",
      challenge: "x",
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: Date.now() - 1,
    });
    // 过期条目由 store 自己判空返回 null，这里模拟同样结果
    consumeCliCode.mockReturnValue(null);
    const expired = await cliExchange(exchangeRequest({ code: "old", codeVerifier: verifier }));

    expect(missing.status).toBe(401);
    expect(expired.status).toBe(401);
    expect(await missing.json()).toEqual(await expired.json());
  });

  it.each([
    ["code 含非法字符", { code: "has space", codeVerifier: verifier }],
    ["verifier 太短", { code: "c", codeVerifier: "short" }],
    ["verifier 含非法字符", { code: "c", codeVerifier: `${"a".repeat(43)}!` }],
    ["缺少字段", { code: "c" }],
  ])("参数非法（%s）时回 400，不查存储", async (_label, body) => {
    const response = await cliExchange(exchangeRequest(body));
    expect(response.status).toBe(400);
    expect(consumeCliCode).not.toHaveBeenCalled();
  });

  it("请求体不是 JSON 时回 400", async () => {
    const bad = new Request(`${origin}/api/auth/cli-exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "nope",
    });
    expect((await cliExchange(bad)).status).toBe(400);
  });

  it("兑换端点接受跨源 CLI 请求（CLI 没有 Origin，不能按浏览器同源策略拦）", async () => {
    consumeCliCode.mockReturnValue({
      username: "alice",
      challenge: pkceChallengeOf(verifier),
      accessToken: "cli-at",
      refreshToken: "cli-rt",
      expiresAt: Date.now() + 60_000,
    });
    // CLI 直连本机 BFF，不带 Origin 头
    const response = await cliExchange(exchangeRequest({ code: "c", codeVerifier: verifier }));
    expect(response.status).toBe(200);
  });
});

describe("pkceChallengeOf", () => {
  it("与 RFC 7636 测试向量一致（CLI 侧同一算法）", () => {
    expect(pkceChallengeOf("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
