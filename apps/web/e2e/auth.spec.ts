import { expect, test } from "@playwright/test";
import { loginThroughUi, readAccount } from "./support/account";

// 这条链路验证的就是登录本身，必须从未登录状态出发
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("关键路径 1：登录", () => {
  test("未登录访问受保护页面会被中间件挡回登录页", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("用正确凭据登录后进入工作台，且 Token 不暴露给页面 JS", async ({ page }) => {
    await loginThroughUi(page, readAccount());

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // 仓库硬约束：token 只在 httpOnly Cookie 里，页面 JS 读不到
    const visibleCookies = await page.evaluate(() => document.cookie);
    expect(visibleCookies).not.toContain("at=");
    expect(visibleCookies).not.toContain("rt=");
    const storage = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(storage).not.toContain("accessToken");
  });

  test("密码错误时停留在登录页并给出提示", async ({ page }) => {
    const account = readAccount();
    await page.goto("/login");
    await page.getByLabel("用户名").fill(account.username);
    await page.getByLabel("密码").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL(/\/login/);
    // 具体文案由后端 ResCode 决定，这里只断言「有可见的错误反馈」
    await expect(
      page.getByRole("status").or(page.locator("[data-sonner-toast]")).first(),
    ).toBeVisible({
      timeout: 20_000,
    });
  });
});
