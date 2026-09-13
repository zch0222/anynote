import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureBuilt, makeHome, randomAccount, runCli, startCli, waitFor } from "./helpers";

/**
 * 浏览器授权登录的**协议面**端到端用例（不需要真浏览器）。
 *
 * 由测试扮演浏览器：从 CLI 打到 stderr 的授权链接取参数，直接调 BFF 的两个接口完成
 * 授权与兑换。真浏览器点「授权」按钮那条链路在 `apps/web/e2e/cli-authorize.spec.ts`
 * 里用 Playwright 覆盖——两边合起来才是完整闭环。
 *
 * 前置：
 *   1. 本地全栈已起（gateway :8080 与 web :3000 都 healthy）
 *   2. `pnpm --filter @anynote/cli build`
 *   3. web 站点可访问；默认 `http://localhost:3000`，用 `ANYNOTE_WEB_URL` 覆盖
 *
 * ⚠️ 容器化部署把前端 Origin 固定成了 `NEXT_PUBLIC_APP_URL`（见 infra/docker-compose.yaml），
 * 因此访问地址必须与镜像构建值一致，否则 BFF 会以 403「请求来源不受信任」拒绝。
 */

const WEB_URL = process.env.ANYNOTE_WEB_URL ?? "http://localhost:3000";

const account = randomAccount();
let sessionCookie = "";

async function registrationHome(): Promise<string> {
  const home = await makeHome();
  const registered = await runCli(
    home,
    [
      "auth",
      "register",
      "--username",
      account.username,
      "--nickname",
      account.nickname,
      "--password-stdin",
    ],
    { stdin: account.password },
  );
  if (registered.code !== 0) {
    throw new Error(`注册测试账号失败：${registered.stdout.slice(0, 300)}`);
  }
  return home;
}

beforeAll(async () => {
  await ensureBuilt();
  const home = await registrationHome();
  try {
    // 用真实凭据换一对会话 Cookie，模拟"浏览器里已经登录"。
    // BFF 与网关都校验 Origin，脚本化请求必须显式带上。
    const response = await fetch(`${WEB_URL}/api/auth/login`, {
      method: "POST",
      headers: { origin: WEB_URL, "content-type": "application/json" },
      body: JSON.stringify({ username: account.username, password: account.password }),
    });
    const cookies = response.headers.getSetCookie();
    const at = cookies.find((cookie) => cookie.startsWith("at="))?.split(";")[0];
    const rt = cookies.find((cookie) => cookie.startsWith("rt="))?.split(";")[0];
    if (!at || !rt) throw new Error(`BFF 未返回会话 Cookie：HTTP ${response.status}`);
    sessionCookie = `${at}; ${rt}`;
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}, 60_000);

afterAll(async () => {
  // 收尾：撤销浏览器会话那一对（CLI 那对由各自用例自己登出）
  if (sessionCookie) {
    await fetch(`${WEB_URL}/api/auth/logout`, {
      method: "POST",
      headers: { origin: WEB_URL, "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({}),
    }).catch(() => undefined);
  }
});

const AUTHORIZE_URL = /(https?:\/\/\S+\/cli\/authorize\?\S+)/;

/** 起一个等待授权的 CLI，返回进程句柄与授权参数。 */
async function startAuthorize(home: string, timeoutSeconds = 60) {
  const running = startCli(home, ["auth", "login", "--timeout", String(timeoutSeconds)], {
    extraEnv: {
      ANYNOTE_WEB_URL: WEB_URL,
      // 无头环境：只打印链接，不尝试 spawn 浏览器（否则 Windows 上会真的弹窗）
      ANYNOTE_OPEN_BROWSER: "0",
    },
  });
  const url = await waitFor(() => AUTHORIZE_URL.exec(running.stderr())?.[1], "授权链接");
  const parsed = new URL(url);
  return {
    running,
    url,
    port: Number(parsed.searchParams.get("port")),
    state: parsed.searchParams.get("state") ?? "",
    challenge: parsed.searchParams.get("challenge") ?? "",
  };
}

/** 模拟"浏览器点授权 → 跳到回环地址"这两跳。 */
async function browserAuthorize(input: {
  port: number;
  state: string;
  challenge: string;
  cookie?: string;
}) {
  const response = await fetch(`${WEB_URL}/api/auth/cli-token`, {
    method: "POST",
    headers: {
      origin: WEB_URL,
      "content-type": "application/json",
      ...(input.cookie ? { cookie: input.cookie } : {}),
    },
    body: JSON.stringify({
      port: input.port,
      state: input.state,
      codeChallenge: input.challenge,
    }),
  });
  const body = (await response.json()) as {
    code: string;
    data?: { code: string; state: string; redirectTo: string };
  };
  if (response.status !== 200 || body.code !== "00000" || !body.data) {
    return { ok: false as const, status: response.status, body };
  }

  // 浏览器整页导航到 CLI 回环地址，CLI 校验 state 后结束等待
  const callback = await fetch(body.data.redirectTo);
  return { ok: true as const, status: callback.status, body, callbackStatus: callback.status };
}

describe("浏览器授权登录（协议面）", () => {
  it("授权链接指向 Web 前端，参数是 base64url 且端口在回环段", async () => {
    const home = await makeHome();
    const session = await startAuthorize(home);
    try {
      const parsed = new URL(session.url);
      expect(parsed.origin).toBe(new URL(WEB_URL).origin);
      expect(parsed.pathname).toBe("/cli/authorize");
      expect(session.port).toBeGreaterThan(1023);
      expect(session.port).toBeLessThanOrEqual(65535);
      // state 与 PKCE challenge 都是 32 字节 base64url（43 字符，无填充）
      expect(session.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(session.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // 无头环境仍会把链接打出来给用户手工打开
      expect(session.running.stderr()).toContain("无法自动打开浏览器");
    } finally {
      session.running.kill();
      await fs.rm(home, { recursive: true, force: true });
    }
  });

  it("完整闭环：授权后 CLI 落盘独立令牌，whoami 可通，输出不泄漏 token", async () => {
    const home = await makeHome();
    const session = await startAuthorize(home);
    try {
      const authorized = await browserAuthorize({
        port: session.port,
        state: session.state,
        challenge: session.challenge,
        cookie: sessionCookie,
      });
      expect(authorized.ok, JSON.stringify(authorized).slice(0, 300)).toBe(true);
      expect(authorized.callbackStatus).toBe(200);

      const settled = await session.running.wait(60_000);
      expect(settled.code, settled.stderr.slice(0, 600)).toBe(0);
      const envelope = JSON.parse(settled.stdout.trim()) as {
        ok: boolean;
        data: Record<string, unknown>;
      };
      expect(envelope.ok).toBe(true);
      expect(envelope.data).toMatchObject({ method: "browser", username: account.username });

      // 凭据可用
      const whoami = await runCli(home, ["auth", "whoami"]);
      expect(whoami.code).toBe(0);
      expect((whoami.data as Record<string, unknown>).username).toBe(account.username);

      // 输出与 stderr 都不含 token
      const credentials = JSON.parse(
        await fs.readFile(path.join(home, "credentials.json"), "utf8"),
      ) as { profiles: Record<string, { accessToken: string; refreshToken: string }> };
      const token = credentials.profiles.default?.accessToken ?? "";
      expect(token).not.toBe("");
      expect(credentials.profiles.default?.refreshToken).not.toBe("");
      expect(settled.stdout).not.toContain(token);
      expect(settled.stderr).not.toContain(token);

      await runCli(home, ["auth", "logout"]);
      // 登出后 profile 被清掉，凭据文件里不再有这个 profile
      const after = JSON.parse(await fs.readFile(path.join(home, "credentials.json"), "utf8")) as {
        profiles: Record<string, unknown>;
      };
      expect(after.profiles.default).toBeUndefined();
    } finally {
      session.running.kill();
      await fs.rm(home, { recursive: true, force: true });
    }
  }, 90_000);

  it("CLI 令牌与浏览器会话独立：CLI 登出后浏览器会话依然有效", async () => {
    const home = await makeHome();
    const session = await startAuthorize(home);
    try {
      const authorized = await browserAuthorize({
        port: session.port,
        state: session.state,
        challenge: session.challenge,
        cookie: sessionCookie,
      });
      expect(authorized.ok).toBe(true);
      const settled = await session.running.wait(60_000);
      expect(settled.code).toBe(0);

      // CLI 登出：只撤销自己那对
      const logout = await runCli(home, ["auth", "logout"]);
      expect(logout.code).toBe(0);

      // 浏览器会话仍然可用
      const me = await fetch(`${WEB_URL}/api/auth/me`, { headers: { cookie: sessionCookie } });
      expect(me.status).toBe(200);
      const body = (await me.json()) as { code: string; data?: { username?: string } };
      expect(body.code).toBe("00000");
      expect(body.data?.username).toBe(account.username);
    } finally {
      session.running.kill();
      await fs.rm(home, { recursive: true, force: true });
    }
  }, 90_000);

  it("授权码是一次性的：同一个 code 兑换两次，第二次失败", async () => {
    // 这条用例要拿到 code 本身，因此不走 CLI 的回环，而是直接用 BFF 换一次 code，
    // 再用 CLI 的兑换端点重复兑换——验证"取用即删"。
    const response = await fetch(`${WEB_URL}/api/auth/cli-token`, {
      method: "POST",
      headers: { origin: WEB_URL, "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ port: 51234, state: "s".repeat(43), codeChallenge: "c".repeat(43) }),
    });
    const body = (await response.json()) as { code: string; data?: { code: string } };
    expect(body.code).toBe("00000");
    const code = body.data?.code ?? "";
    expect(code).not.toBe("");

    const verifier = "v".repeat(43);
    const first = await fetch(`${WEB_URL}/api/auth/cli-exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier }),
    });
    // verifier 与 challenge 不匹配 → 401，但 code 已被消费
    expect(first.status).toBe(401);

    const second = await fetch(`${WEB_URL}/api/auth/cli-exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier }),
    });
    expect(second.status).toBe(401);
    const failure = (await second.json()) as { code: string };
    expect(failure.code).toBe("A0301");
  });

  it("未登录的浏览器会话被拒：不签发授权码", async () => {
    const home = await makeHome();
    const session = await startAuthorize(home, 20);
    try {
      const authorized = await browserAuthorize({
        port: session.port,
        state: session.state,
        challenge: session.challenge,
        // 不带会话 Cookie
      });
      expect(authorized.ok).toBe(false);
      expect(authorized.status).toBe(401);
      // 未登录时 data 恒为 null，绝不签发授权码
      expect((authorized.body as { data?: unknown }).data).toBeNull();

      // CLI 仍在等待 → 超时后以退出码 3（未认证）结束：
      // 对 agent 的结论是「当前没有可用凭据，让用户重跑 auth login」。
      const settled = await session.running.wait(45_000);
      expect(settled.code).toBe(3);
      // 非 TTY 下失败信封走 stdout（stdout 只放数据，提示在 stderr）
      const failure = JSON.parse(settled.stdout.trim()) as {
        ok: boolean;
        error?: { message: string };
      };
      expect(failure.ok).toBe(false);
      expect(failure.error?.message).toContain("等待授权超时");
    } finally {
      session.running.kill();
      await fs.rm(home, { recursive: true, force: true });
    }
  }, 90_000);

  it("state 不匹配的回调被 CLI 拒绝，且不妨碍后续合法回调", async () => {
    const home = await makeHome();
    const session = await startAuthorize(home);
    try {
      // 手工构造一个 state 不对的回调（模拟本机其他进程抢注端口）
      const wrong = await fetch(
        `http://127.0.0.1:${session.port}/callback?code=evil&state=${"x".repeat(43)}`,
      );
      expect(wrong.status).toBe(400);
      expect(await wrong.text()).toContain("state 校验失败");

      // 合法回调仍然能完成授权
      const authorized = await browserAuthorize({
        port: session.port,
        state: session.state,
        challenge: session.challenge,
        cookie: sessionCookie,
      });
      expect(authorized.ok).toBe(true);
      const settled = await session.running.wait(60_000);
      expect(settled.code).toBe(0);
      await runCli(home, ["auth", "logout"]);
    } finally {
      session.running.kill();
      await fs.rm(home, { recursive: true, force: true });
    }
  }, 90_000);
});
