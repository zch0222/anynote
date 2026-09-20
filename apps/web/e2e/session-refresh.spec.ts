import { expect, test } from "@playwright/test";
import { establishFreshSession } from "./support/session";

/**
 * 整页刷新的会话保活（桌面侧；移动端同链路见 mobile-core.spec.ts 的「移动端会话保活」）。
 *
 * 「移动端刷新之后登录状态丢了」的根因在中间件，桌面同享：`at` 过期被浏览器删除、
 * `rt` 仍有效时，整页请求被 307 到 `/login`。修复后判据是 `at || rt`，页面加载时的
 * `/api/auth/me` 用 `rt` 换新 `at`。这组用例跑在 chromium project（非 `mobile-*` 文件名）。
 *
 * 用例会真的走一次 refresh（吊销旧 rt），所以每个用例先现场登录换新凭据，
 * 不消耗 global-setup 留下的共享 storageState（见 support/session.ts）。
 */
test.describe("整页刷新的会话保活（at 过期、rt 仍有效）", () => {
  test("仅剩 rt 时刷新 /notes 不丢登录态，且 at 被续期写回", async ({ page }) => {
    await establishFreshSession(page);
    await page.context().clearCookies({ name: "at" });

    await page.goto("/notes");
    // 不是被中间件 307 到 /login，而是留在画廊
    await expect(page).toHaveURL(/\/notes/, { timeout: 30_000 });
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    const at = (await page.context().cookies()).find((cookie) => cookie.name === "at");
    expect(at, "at 应已随续期重新写入").toBeDefined();
    expect((at?.expires ?? 0) * 1000).toBeGreaterThan(Date.now());
  });

  test("仅剩 rt 时刷新首页仍进入工作台，而不是被当成访客留在官网", async ({ page }) => {
    // 首页「已登录就跳 /dashboard」的判据与中间件同口径（at || rt）
    await establishFreshSession(page);
    await page.context().clearCookies({ name: "at" });

    await page.goto("/");
    // /dashboard 重定向到知识库画廊，这里等最终地址
    await expect(page).toHaveURL(/\/notes/, { timeout: 30_000 });
  });
});
