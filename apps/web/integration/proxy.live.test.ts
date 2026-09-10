import { randomBytes } from "node:crypto";
import type { paths as AuthPaths } from "@anynote/api-client/src/auth";
import createClient from "openapi-fetch";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

// 显式运行（pnpm --filter web test:integration:auth），连接真实本地栈与生产构建的 BFF。
const origin = "http://localhost:3000";
const gateway = "http://localhost:8080";
const bff = createClient<AuthPaths>({ baseUrl: `${origin}/api/auth`, redirect: "manual" });
const auth = createClient<AuthPaths>({ baseUrl: `${gateway}/api/auth`, redirect: "manual" });
const account = {
  username: `e2e${randomBytes(5).toString("hex")}`,
  password: `Aa1${randomBytes(6).toString("hex")}`,
  nickname: "代理集成测试临时账号",
  sex: 0,
};
type Pair = { accessToken: string; refreshToken: string };
const sessions: Pair[] = [];
let initial: Pair;

function setCookies(response: Response) {
  return response.headers.getSetCookie();
}

function capture(response: Response): Pair {
  const cookies = setCookies(response);
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

function cookieHeader(pair: Pair, keys: "both" | "refresh-only" = "both") {
  return keys === "both"
    ? `at=${pair.accessToken}; rt=${pair.refreshToken}`
    : `rt=${pair.refreshToken}`;
}

async function assertRevoked(refreshToken: string) {
  const result = await auth.POST("/refresh", { body: { refreshToken } });
  const unexpected = result.data?.data;
  if (unexpected?.accessToken && unexpected.refreshToken) {
    sessions.push({ accessToken: unexpected.accessToken, refreshToken: unexpected.refreshToken });
  }
  expect(result.response.status).toBe(401);
  const failure = z.object({ code: z.string() }).safeParse(result.error);
  expect(failure.success && failure.data.code === "A0311").toBe(true);
}

beforeAll(async () => {
  const registered = await bff.POST("/register", { body: account, headers: { origin } });
  expect(registered.response.status).toBe(200);
  expect(registered.data?.code).toBe("00000");
  initial = capture(registered.response);
});

afterAll(async () => {
  const results = await Promise.allSettled(
    sessions.map((pair) => auth.POST("/logout", { body: pair })),
  );
  expect(
    results.every((result) => result.status === "fulfilled" && result.value.data?.code === "00000"),
  ).toBe(true);
});

describe.sequential("BFF 代理 / me / 刷新真实链路", () => {
  it("me 转发 /user/mine 并只返回白名单资料", async () => {
    const response = await fetch(`${origin}/api/auth/me`, {
      headers: { cookie: cookieHeader(initial) },
    });
    expect(response.status).toBe(200);
    const body = z
      .object({ code: z.string(), data: z.record(z.string(), z.unknown()) })
      .parse(await response.json());
    expect(body.code).toBe("00000");
    expect(body.data.username).toBe(account.username);
    // 后端实体里的敏感与审计字段不允许进入浏览器。
    for (const key of ["password", "params", "createBy", "deleted", "token"]) {
      expect(body.data[key]).toBeUndefined();
    }
  });

  it("me 仅凭 rt 时自动刷新并旋转两件套", async () => {
    const response = await fetch(`${origin}/api/auth/me`, {
      headers: { cookie: cookieHeader(initial, "refresh-only") },
    });
    expect(response.status).toBe(200);
    const rotated = capture(response);
    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    await assertRevoked(initial.refreshToken);
  });

  it("代理注入 Bearer 透传业务请求", async () => {
    const pair = sessions.at(-1);
    if (!pair) throw new Error("缺少可用会话");
    const response = await fetch(`${origin}/api/proxy/system/user/mine`, {
      headers: { cookie: cookieHeader(pair) },
    });
    expect(response.status).toBe(200);
    const body = z
      .object({ code: z.string(), data: z.object({ username: z.string().nullish() }) })
      .parse(await response.json());
    expect(body.code).toBe("00000");
    expect(body.data.username).toBe(account.username);
  });

  it("并发 10 个仅 rt 请求只产生一次刷新", async () => {
    // 模拟 at 到期后被浏览器删除：请求只带 rt，业务调用必须先刷新再转发。
    const login = await bff.POST("/login", { body: account, headers: { origin } });
    expect(login.data?.code).toBe("00000");
    const pair = capture(login.response);

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        fetch(`${origin}/api/proxy/system/user/mine`, {
          headers: { cookie: cookieHeader(pair, "refresh-only") },
        }),
      ),
    );
    for (const response of responses) {
      expect(response.status).toBe(200);
      const body = z.object({ code: z.string() }).parse(await response.json());
      expect(body.code).toBe("00000");
    }
    // 单飞刷新意味着 10 个响应携带同一对新凭据；出现两代 rt 即说明刷新了多次。
    const rotatedTokens = new Set(
      responses.flatMap((response) =>
        setCookies(response)
          .filter((cookie) => cookie.startsWith("rt="))
          .map((cookie) => cookie.split(";")[0]),
      ),
    );
    expect(rotatedTokens.size).toBe(1);
    // 若发生了第二次刷新，第二次必用已旋转的旧 rt 失败；这里旧 rt 必须已被撤销。
    await assertRevoked(pair.refreshToken);
    sessions.push({
      accessToken: pair.accessToken,
      refreshToken: rotatedTokens.values().next().value?.slice(3) ?? "",
    });
  });

  it("无 Cookie 的代理请求返回 401 并清除两件套", async () => {
    const response = await fetch(`${origin}/api/proxy/system/user/mine`);
    expect(response.status).toBe(401);
    const cleared = setCookies(response).filter((cookie) => /^(at|rt)=;/.test(cookie));
    expect(cleared.length).toBe(2);
  });

  it("代理写方法校验 Origin 并透传 POST 请求体", async () => {
    const forbidden = await fetch(`${origin}/api/proxy/auth/logout`, {
      method: "POST",
      headers: {
        origin: "https://untrusted.example",
        cookie: "at=x; rt=y",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(forbidden.status).toBe(403);

    // logout 的后端契约要求请求体携带凭据，浏览器端应走专用 BFF；
    // 这里用 refresh 验证代理对 POST + JSON body 的完整透传。
    const login = await bff.POST("/login", { body: account, headers: { origin } });
    expect(login.data?.code).toBe("00000");
    const pair = capture(login.response);
    const response = await fetch(`${origin}/api/proxy/auth/refresh`, {
      method: "POST",
      headers: {
        origin,
        cookie: cookieHeader(pair),
        "content-type": "application/json",
      },
      body: JSON.stringify({ refreshToken: pair.refreshToken }),
    });
    expect(response.status).toBe(200);
    const body = z
      .object({
        code: z.string(),
        data: z.object({ accessToken: z.string(), refreshToken: z.string() }),
      })
      .parse(await response.json());
    expect(body.code).toBe("00000");
    await assertRevoked(pair.refreshToken);
    sessions.push(body.data);
  });
});
