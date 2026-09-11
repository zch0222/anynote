import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { request } from "@playwright/test";

// Playwright 用 CJS 加载配置与 globalSetup，这里不能用 import.meta.url；
// __dirname 在两种模块格式下都可用。
export const AUTH_DIR = join(__dirname, ".auth");
export const STATE_PATH = join(AUTH_DIR, "state.json");
export const ACCOUNT_PATH = join(AUTH_DIR, "account.json");

export type E2EAccount = {
  username: string;
  password: string;
  nickname: string;
  sex: number;
};

/**
 * 每轮 E2E 建一个随机 `e2e` 前缀的临时账号并登录一次，
 * 把登录态存成 storageState 给所有用例复用。
 *
 * 不复用固定账号：用例会写数据（建知识库 / 笔记），固定账号跑几轮就脏了。
 * 账号本身不删——后端没有注销端点，与 `integration/auth.live.test.ts` 的做法一致。
 */
async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const account: E2EAccount = {
    username: `e2e${randomBytes(5).toString("hex")}`,
    password: `Aa1${randomBytes(6).toString("hex")}`,
    nickname: "E2E 临时账号",
    sex: 0,
  };

  const context = await request.newContext({ baseURL });
  try {
    // BFF 与网关都校验 Origin，脚本化请求必须显式带上（见 M7.6 环境发现）
    const headers = { origin: baseURL, "content-type": "application/json" };

    const registered = await context.post("/api/auth/register", { headers, data: account });
    const registerBody = await registered.json().catch(() => null);
    if (registerBody?.code !== "00000") {
      throw new Error(`E2E 账号注册失败：${registered.status()} ${JSON.stringify(registerBody)}`);
    }

    const loggedIn = await context.post("/api/auth/login", {
      headers,
      data: { username: account.username, password: account.password },
    });
    const loginBody = await loggedIn.json().catch(() => null);
    if (loginBody?.code !== "00000") {
      throw new Error(`E2E 账号登录失败：${loggedIn.status()} ${JSON.stringify(loginBody)}`);
    }

    mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: STATE_PATH });
    writeFileSync(ACCOUNT_PATH, JSON.stringify(account, null, 2));
  } finally {
    await context.dispose();
  }
}

export default globalSetup;
