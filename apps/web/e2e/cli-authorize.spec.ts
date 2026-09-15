import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * CLI 浏览器授权登录的真实栈端到端用例。
 *
 * 覆盖的是**跨进程、跨组件的完整闭环**：真 CLI 子进程起回环服务 → 真浏览器打开授权页
 * → 真 BFF 调真后端签发独立令牌 → CLI 用 code + PKCE verifier 兑换并落盘。
 * 唯一被"扮演"的角色是用户点「授权」那一下（由 Playwright 点）。
 *
 * 前置：全栈已起（`docker compose ... up -d`），且 `pnpm --filter @anynote/cli build`。
 * 运行：`pnpm --filter web test:e2e -- cli-authorize.spec.ts`
 */

const CLI_ENTRY = path.resolve(__dirname, "../../cli/dist/anynote.mjs");
const WEB_ORIGIN = process.env.E2E_BASE_URL ?? "http://localhost:3000";

type Running = {
  stderr: () => string;
  stdout: () => string;
  wait: () => Promise<{ code: number; stdout: string; stderr: string }>;
  kill: () => void;
};

function startCliLogin(home: string, extraEnv: Record<string, string> = {}): Running {
  const child = spawn(process.execPath, [CLI_ENTRY, "auth", "login", "--timeout", "120"], {
    env: {
      ...process.env,
      ANYNOTE_CONFIG_DIR: home,
      // 授权页与兑换都在 Web 侧，CLI 只需要知道前端地址
      ANYNOTE_WEB_URL: WEB_ORIGIN,
      ANYNOTE_API_URL: process.env.ANYNOTE_API_URL ?? "http://localhost:8080",
      ANYNOTE_TOKEN: "",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  return {
    stderr: () => stderr,
    stdout: () => stdout,
    wait: () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`CLI 未在 120s 内退出；stderr=${stderr.slice(0, 800)}`));
        }, 120_000);
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ code: code ?? 0, stdout, stderr });
        });
      }),
    kill: () => child.kill("SIGKILL"),
  };
}

/** 从 stderr 里抠出授权链接（CLI 无论能否自动开浏览器都会打印它）。 */
async function readAuthorizeUrl(running: Running): Promise<string> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const match = /(https?:\/\/\S+\/cli\/authorize\?\S+)/.exec(running.stderr());
    if (match?.[1]) return match[1];
    if (Date.now() > deadline) {
      throw new Error(`未等到授权链接；stderr=${running.stderr().slice(0, 800)}`);
    }
    await new Promise((done) => setTimeout(done, 100));
  }
}

/** 等 CLI 退出并断言成功。 */
async function expectCliOk(running: Running): Promise<Record<string, unknown>> {
  const settled = await running.wait();
  expect(settled.code, `CLI 退出码非 0；stderr=${settled.stderr.slice(0, 800)}`).toBe(0);
  const envelope = JSON.parse(settled.stdout.trim()) as { ok: boolean; data: unknown };
  expect(envelope.ok).toBe(true);
  return envelope.data as Record<string, unknown>;
}

let home: string;

test.beforeAll(async () => {
  await fs.access(CLI_ENTRY).catch(() => {
    throw new Error(`找不到 ${CLI_ENTRY}，先执行 pnpm --filter @anynote/cli build`);
  });
  home = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-cli-e2e-"));
});

test.afterAll(async () => {
  if (home) await fs.rm(home, { recursive: true, force: true });
});

test.describe("CLI 浏览器授权登录", () => {
  // 授权页要验证的正是"未登录时先登录"，所以这条用例从匿名状态出发
  test.use({ storageState: { cookies: [], origins: [] } });

  test("未登录 → 先登录 → 授权 → CLI 拿到独立令牌并落盘", async ({ page }) => {
    const running = startCliLogin(home);

    try {
      const authorizeUrl = await readAuthorizeUrl(running);

      // CLI 打印的链接指向 Web 前端
      expect(authorizeUrl.startsWith(WEB_ORIGIN)).toBe(true);
      const parsed = new URL(authorizeUrl);
      expect(parsed.pathname).toBe("/cli/authorize");
      const state = parsed.searchParams.get("state") ?? "";
      const port = parsed.searchParams.get("port") ?? "";
      expect(state).not.toBe("");
      expect(Number(port)).toBeGreaterThan(1023);

      // 未登录直接打开授权页：应被引导到登录页，并带着完整参数能回到授权流程
      await page.goto(authorizeUrl);
      await expect(page).toHaveURL(/\/login\?next=/);
      const next = new URL(page.url()).searchParams.get("next") ?? "";
      expect(decodeURIComponent(next)).toContain("/cli/authorize");

      // 在登录页完成登录，应当自动回到授权页
      const account = JSON.parse(
        await fs.readFile(path.join(__dirname, ".auth", "account.json"), "utf8"),
      ) as { username: string; password: string };
      await page.getByLabel("用户名").fill(account.username);
      await page.getByLabel("密码", { exact: true }).fill(account.password);
      await page.getByRole("button", { name: "登录" }).click();

      await expect(page.getByRole("heading", { name: "授权 CLI 登录" })).toBeVisible({
        timeout: 30_000,
      });
      // 页面上要看得到"正在给哪个账号授权"
      await expect(page.getByText(account.username)).toBeVisible({ timeout: 20_000 });

      // 用户手势：点授权
      await page.getByRole("button", { name: "授权", exact: true }).click();

      // 浏览器跳到 CLI 的回环地址，页面提示可以关闭
      await expect(page.getByText("已收到授权")).toBeVisible({ timeout: 30_000 });

      const data = await expectCliOk(running);
      expect(data).toMatchObject({ method: "browser", username: account.username });

      // 凭据落盘，且输出与 stderr 都不含 token
      const credentials = JSON.parse(
        await fs.readFile(path.join(home, "credentials.json"), "utf8"),
      ) as { profiles: Record<string, { accessToken: string; refreshToken: string }> };
      const profile = credentials.profiles.default;
      expect(profile?.accessToken).toBeTruthy();
      expect(profile?.refreshToken).toBeTruthy();
      expect(JSON.stringify(data)).not.toContain(profile?.accessToken ?? "x");
    } finally {
      running.kill();
    }
  });

  test("CLI 拿到的令牌与浏览器会话相互独立：CLI 登出不影响网页", async ({ browser }) => {
    // 用一份全新的浏览器上下文登录，模拟"另一个会话"
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const account = JSON.parse(
      await fs.readFile(path.join(__dirname, ".auth", "account.json"), "utf8"),
    ) as { username: string; password: string; nickname: string };

    const browserHome = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-cli-e2e-"));
    const running = startCliLogin(browserHome);
    try {
      // 先在浏览器里登录
      await page.goto("/login");
      await page.getByLabel("用户名").fill(account.username);
      await page.getByLabel("密码", { exact: true }).fill(account.password);
      await page.getByRole("button", { name: "登录" }).click();
      await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

      // 再授权 CLI
      const authorizeUrl = await readAuthorizeUrl(running);
      await page.goto(authorizeUrl);
      await page.getByRole("button", { name: "授权", exact: true }).click();
      await expect(page.getByText("已收到授权")).toBeVisible({ timeout: 30_000 });
      await expectCliOk(running);

      // CLI 登出：只撤销自己的令牌
      const logout = spawn(process.execPath, [CLI_ENTRY, "auth", "logout"], {
        env: { ...process.env, ANYNOTE_CONFIG_DIR: browserHome, ANYNOTE_TOKEN: "" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      const logoutCode = await new Promise<number>((resolve) => {
        logout.on("close", (code) => resolve(code ?? 0));
      });
      expect(logoutCode).toBe(0);

      // 浏览器会话仍然有效
      await page.goto("/notes");
      await expect(page).toHaveURL(/\/notes$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    } finally {
      running.kill();
      await context.close();
      await fs.rm(browserHome, { recursive: true, force: true });
    }
  });
});

test.describe("CLI 授权页在已登录状态下的行为", () => {
  test("自动展示当前账号，点授权后回传并跳回回环地址", async ({ page }) => {
    const running = startCliLogin(home);
    try {
      const authorizeUrl = await readAuthorizeUrl(running);
      await page.goto(authorizeUrl);

      await expect(page.getByRole("heading", { name: "授权 CLI 登录" })).toBeVisible();
      // 已登录：不经登录页，直接看到账号回显
      await expect(page.getByText("将以以下账号授权")).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: "授权", exact: true }).click();
      await expect(page.getByText("已收到授权")).toBeVisible({ timeout: 30_000 });
      await expectCliOk(running);
    } finally {
      running.kill();
    }
  });

  test("参数非法时给出可读错误而不是跳登录页", async ({ page }) => {
    await page.goto("/cli/authorize?port=80&state=x&challenge=y");
    await expect(page.getByRole("heading", { name: "授权链接无效" })).toBeVisible();
    await expect(page.getByText(/port 必须在 1024-65535 之间/)).toBeVisible();
  });

  test("页面 JS 拿不到任何令牌，授权码也不出现在地址栏历史之外", async ({ page }) => {
    const running = startCliLogin(home);
    try {
      const authorizeUrl = await readAuthorizeUrl(running);
      await page.goto(authorizeUrl);
      await expect(page.getByRole("heading", { name: "授权 CLI 登录" })).toBeVisible();

      // 仓库硬约束：token 只在 httpOnly Cookie 里
      const cookie = await page.evaluate(() => document.cookie);
      expect(cookie).not.toContain("at=");
      expect(cookie).not.toContain("rt=");
      const storage = await page.evaluate(() => JSON.stringify(window.localStorage));
      expect(storage).not.toContain("accessToken");

      running.kill();
    } finally {
      running.kill();
    }
  });
});
