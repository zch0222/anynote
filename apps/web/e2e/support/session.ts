import { readFileSync } from "node:fs";
import { type Page, request, test } from "@playwright/test";
import { ACCOUNT_PATH, type E2EAccount } from "../global-setup";

/**
 * 给当前浏览器上下文注入一对**全新**的 at / rt Cookie。
 *
 * 会话保活用例（仅剩 rt 的整页刷新）会真的走一次 refresh——它会轮换并**吊销旧
 * refreshToken**。如果直接用 global-setup 留在 storageState 里的那对 Cookie，第一个
 * 用例跑完就会把共享的 rt 吊销：同文件后面的用例、以及整轮 E2E 里其它还需要 rt 的
 * 用例（桌面 ↔ 移动两个 project 共享同一份 state.json）会拿失效的 rt 而误判失败。
 * 所以这类用例一律先现场登录换新凭据，不消耗共享状态。
 */
export async function establishFreshSession(page: Page): Promise<void> {
  const account: E2EAccount = JSON.parse(readFileSync(ACCOUNT_PATH, "utf8"));
  const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";

  const apiContext = await request.newContext({ baseURL });
  try {
    // BFF 校验 Origin，脚本化请求必须显式带上（与 global-setup 同一约束）
    const response = await apiContext.post("/api/auth/login", {
      headers: { origin: baseURL, "content-type": "application/json" },
      data: { username: account.username, password: account.password },
    });
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    if (response.status() !== 200 || body?.code !== "00000") {
      throw new Error(`会话保活用例的前置登录失败：${response.status()} ${JSON.stringify(body)}`);
    }
    // APIRequestContext 没有cookies()；storageState() 返回的 Cookie 列表可直接注入浏览器上下文
    const { cookies } = await apiContext.storageState();
    await page.context().clearCookies();
    await page.context().addCookies(cookies);
  } finally {
    await apiContext.dispose();
  }
}
