import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authLogin } from "../commands/auth";
import { NetworkError } from "../core/exit";
import { envelope, failure, makeContext } from "./helpers";

/**
 * `auth login` 浏览器授权路径的端到端式单测。
 *
 * 这里**真的**起回环 HTTP 服务（不打桩 loopback），只有浏览器打开动作与 Web 端
 * 兑换请求被打桩——因此覆盖了真实的端口分配、回调解析、state 校验与 Promise 时序。
 */

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-browser-login-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const profileRoute = {
  method: "GET" as const,
  match: "/api/system/user/mine",
  body: envelope({ id: 1, username: "alice", nickname: "小爱" }),
};

/** 从授权链接里取出回环端口与 state，模拟"用户在浏览器上点了授权"。 */
function readAuthorizeUrl(url: string) {
  const parsed = new URL(url);
  return {
    port: Number(parsed.searchParams.get("port")),
    state: parsed.searchParams.get("state") ?? "",
    challenge: parsed.searchParams.get("challenge") ?? "",
  };
}

/**
 * 装一个"假浏览器"：被调用时立刻按 CLI 的回环地址投递回调，
 * 也就是把用户在授权页上点「授权」之后浏览器跳回本机的那一跳自动化。
 */
function fakeBrowser(onUrl?: (url: string) => void) {
  const opened: string[] = [];
  return {
    opened,
    open: async (url: string) => {
      opened.push(url);
      onUrl?.(url);
      const { port, state } = readAuthorizeUrl(url);
      // 立刻打回调；CLI 侧可能还没走到 waitForCode，正好验证暂存分支。
      await fetch(
        `http://127.0.0.1:${port}/callback?code=code-123&state=${encodeURIComponent(state)}`,
      );
      return true;
    },
  };
}

function exchangeStub(data: unknown) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const webFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { webFetch, calls };
}

describe("auth login 浏览器授权", () => {
  it("完整闭环：开浏览器 → 收回调 → 兑换令牌 → 落盘凭据", async () => {
    const browser = fakeBrowser();
    const exchange = exchangeStub(
      envelope({
        accessToken: "cli-at",
        refreshToken: "cli-rt",
        expiresAt: 1_800_000_000_000,
        username: "alice",
      }),
    );
    const { ctx, calls, io } = makeContext({
      configDir: dir,
      routes: [profileRoute],
      openBrowser: browser.open,
      webFetch: exchange.webFetch,
    });

    const output = await authLogin.run(ctx, { passwordOnly: false, timeout: 30 });

    expect(output.data).toMatchObject({ method: "browser", username: "alice" });
    // 输出与 stderr 都不得含 token
    expect(JSON.stringify(output.data)).not.toContain("cli-at");
    expect(io.stderr).not.toContain("cli-at");

    await expect(ctx.credentials.readProfile()).resolves.toMatchObject({
      accessToken: "cli-at",
      refreshToken: "cli-rt",
      username: "alice",
    });

    // 兑换请求带上了 PKCE verifier，且与服务端收到的 challenge 自洽
    expect(exchange.calls).toHaveLength(1);
    expect(exchange.calls[0]?.url).toBe("http://web.test/api/auth/cli-exchange");
    const { code, codeVerifier } = exchange.calls[0]?.body as {
      code: string;
      codeVerifier: string;
    };
    expect(code).toBe("code-123");
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { createCodeChallenge } = await import("../auth/pkce");
    expect(createCodeChallenge(codeVerifier)).toBe(
      readAuthorizeUrl(browser.opened[0] ?? "").challenge,
    );

    // 授权链接指向配置的 Web 站点
    expect(browser.opened[0]).toContain("http://web.test/cli/authorize");
  });

  it("兑换响应不带用户名时，回落到 whoami 打后端确认真实身份", async () => {
    const browser = fakeBrowser();
    // 刻意不给 username：BFF 的回显不可作为身份依据
    const exchange = exchangeStub(envelope({ accessToken: "cli-at", refreshToken: "cli-rt" }));
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [profileRoute],
      openBrowser: browser.open,
      webFetch: exchange.webFetch,
    });

    const output = await authLogin.run(ctx, { passwordOnly: false, timeout: 30 });

    expect(output.data).toMatchObject({ method: "browser", username: "alice" });
    expect(calls.some((call) => call.url.includes("/api/system/user/mine"))).toBe(true);
    await expect(ctx.credentials.readProfile()).resolves.toMatchObject({ username: "alice" });
  });

  it("浏览器打不开时把授权链接打到 stderr，等用户手工完成", async () => {
    const exchange = exchangeStub(envelope({ accessToken: "at", refreshToken: "rt" }));
    const { ctx, io } = makeContext({
      configDir: dir,
      routes: [profileRoute],
      // 默认 openBrowser 返回 false（无头环境）
      openBrowser: async (url) => {
        const { port, state } = readAuthorizeUrl(url);
        await fetch(`http://127.0.0.1:${port}/callback?code=c&state=${encodeURIComponent(state)}`);
        return false;
      },
      webFetch: exchange.webFetch,
    });

    await authLogin.run(ctx, { passwordOnly: false, timeout: 30 });

    expect(io.stderr).toContain("无法自动打开浏览器");
    expect(io.stderr).toContain("/cli/authorize");
  });

  it("超时后报错并关闭回环服务，端口不会一直占着", async () => {
    const exchange = exchangeStub(envelope({ accessToken: "at", refreshToken: "rt" }));
    const { ctx } = makeContext({
      configDir: dir,
      routes: [profileRoute],
      // 开了浏览器但用户一直没点授权
      openBrowser: async () => true,
      webFetch: exchange.webFetch,
    });

    // `--timeout` 的下限是 10 秒（见命令的 zod 定义），所以这条用例本身要等满 10 秒；
    // 更短的超时行为由 browser-login-flow 的单元用例覆盖。
    await expect(authLogin.run(ctx, { passwordOnly: false, timeout: 10 })).rejects.toThrow(
      /等待授权超时（10 秒）/,
    );
    expect(exchange.calls).toHaveLength(0);
  }, 20_000);

  it("授权被拒（401）时把 BFF 的错误消息原样抛出", async () => {
    const exchange = exchangeStub(failure("A0301", "授权码无效或已过期，请重新登录"));
    const { ctx } = makeContext({
      configDir: dir,
      routes: [profileRoute],
      openBrowser: fakeBrowser().open,
      webFetch: exchange.webFetch,
    });

    await expect(authLogin.run(ctx, { passwordOnly: false, timeout: 30 })).rejects.toThrow(
      "授权码无效或已过期，请重新登录",
    );
    await expect(ctx.credentials.readProfile()).resolves.toBeNull();
  });

  it("Web 站点连不上时报 NetworkError，提示可访问性", async () => {
    const { ctx } = makeContext({
      configDir: dir,
      routes: [profileRoute],
      openBrowser: fakeBrowser().open,
      webFetch: async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: { code: "ECONNREFUSED" },
        });
      },
    });

    await expect(authLogin.run(ctx, { passwordOnly: false, timeout: 30 })).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it("whoami 失败不影响登录，用户名回落到 unknown（令牌仍可用）", async () => {
    const exchange = exchangeStub(envelope({ accessToken: "cli-at", refreshToken: "cli-rt" }));
    const { ctx } = makeContext({
      configDir: dir,
      // 不打 whoami 桩 → 桩 fetch 返回 404 信封
      openBrowser: fakeBrowser().open,
      webFetch: exchange.webFetch,
    });

    const output = await authLogin.run(ctx, { passwordOnly: false, timeout: 30 });
    expect(output.data).toMatchObject({ username: "unknown", method: "browser" });
    await expect(ctx.credentials.readProfile()).resolves.toMatchObject({
      accessToken: "cli-at",
      username: "unknown",
    });
  });

  it("whoami 不通时必须在 stderr 警告，且 verified=false（别把数据面问题盖住）", async () => {
    // 回归护栏：api-url 误设成 Web 前端时，登录"成功"但下一条命令必然 404。
    // 旧实现只用回显的 username，输出里看不出任何异常。
    const exchange = exchangeStub(
      envelope({ accessToken: "cli-at", refreshToken: "cli-rt", username: "alice" }),
    );
    const { ctx, io } = makeContext({
      configDir: dir,
      // 不打 whoami 桩 → 探测失败
      openBrowser: fakeBrowser().open,
      webFetch: exchange.webFetch,
    });

    const output = await authLogin.run(ctx, { passwordOnly: false, timeout: 30 });

    expect(output.data).toMatchObject({ verified: false });
    expect(io.stderr).toContain("警告");
    expect(io.stderr).toContain("Gateway");
    // 探测失败不该让到手的登录作废
    await expect(ctx.credentials.readProfile()).resolves.toMatchObject({ accessToken: "cli-at" });
  });

  it("whoami 通时 verified=true 且不打警告", async () => {
    const exchange = exchangeStub(
      envelope({ accessToken: "cli-at", refreshToken: "cli-rt", username: "alice" }),
    );
    const { ctx, io } = makeContext({
      configDir: dir,
      routes: [profileRoute],
      openBrowser: fakeBrowser().open,
      webFetch: exchange.webFetch,
    });

    const output = await authLogin.run(ctx, { passwordOnly: false, timeout: 30 });

    expect(output.data).toMatchObject({ verified: true, username: "alice" });
    expect(io.stderr).not.toContain("警告");
    expect(output.render?.(output.data)).not.toContain("尚未通过网关校验");
  });

  it("显式给 --username 时走口令路径，不启动回环服务", async () => {
    const exchange = exchangeStub(envelope({ accessToken: "x", refreshToken: "y" }));
    let browserOpened = false;
    const { ctx, calls } = makeContext({
      configDir: dir,
      routes: [
        {
          method: "POST",
          match: "/api/auth/login",
          body: envelope({
            username: "alice",
            token: { accessToken: "pw-at", refreshToken: "pw-rt" },
          }),
        },
      ],
      openBrowser: async () => {
        browserOpened = true;
        return true;
      },
      webFetch: exchange.webFetch,
    });

    const output = await authLogin.run(ctx, {
      username: "alice",
      password: "pw",
      passwordStdin: false,
      passwordOnly: false,
      timeout: 30,
    });

    expect(output.data).toMatchObject({ method: "password", username: "alice" });
    expect(browserOpened).toBe(false);
    expect(exchange.calls).toHaveLength(0);
    expect(calls.some((call) => call.url.includes("/api/auth/login"))).toBe(true);
  });

  it("--no-browser 时不做浏览器授权，缺少用户名就报用法错误", async () => {
    const exchange = exchangeStub(envelope({ accessToken: "x", refreshToken: "y" }));
    const { ctx } = makeContext({
      configDir: dir,
      openBrowser: fakeBrowser().open,
      webFetch: exchange.webFetch,
    });

    await expect(authLogin.run(ctx, { passwordOnly: true, timeout: 30 })).rejects.toThrow(
      /--username/,
    );
    expect(exchange.calls).toHaveLength(0);
  });
});
