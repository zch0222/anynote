import { expect, test } from "@playwright/test";

/**
 * 官网首页（UI 补稿 D-19 / M-14）。
 *
 * 这一页的特殊之处是**它对未登录访客公开**，所以最关键的两条用例都必须从
 * 未登录状态出发：一是访客真的能看到落地页（而不是被登录墙挡住），
 * 二是已登录用户不该停在营销页上（该被送回工作台）。
 *
 * 与单元测试的分工：单测护结构与文案（不需要后端），这里护**真实链路**——
 * 中间件放行、BFF 与 Gateway 不参与、跳转目标真的可达。
 */

/** 访客视角：不带任何 Cookie。这是本文件大部分用例的默认前提。 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("官网首页 · 访客可见", () => {
  test("未登录访问 / 看到落地页，不被挡到登录页", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("landing-page")).toBeVisible();
    // 反向断言：如果哪天首页又被登录墙挡住，这里会明确指出
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("首屏主文案与两个 CTA 都在", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "把知识，安顿在一个安静的地方" }),
    ).toBeVisible();
    // 顶部一个、首屏一个、转化区一个
    await expect(page.getByRole("link", { name: "免费开始" })).toHaveCount(3);
    await expect(page.getByRole("link", { name: "了解 AI 能力" })).toBeVisible();
  });

  test("主视觉真的有图（CSS 变量解析成功，不是一片空白）", async ({ page }) => {
    await page.goto("/");
    const hero = page.getByTestId("landing-hero-image");
    await expect(hero).toBeVisible();
    // `background-image` 走 CSS 变量：变量拼错时这里会是 "none"，而页面不报错
    const bg = await hero.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).toContain("landing-hero");

    // 图确实可用：判据是"不是 4xx/5xx"而不是"等于 200"。
    // 第二次加载时浏览器会带 `If-None-Match`，服务端回 304——那也是"图好好的"，
    // 写死 200 会在本地复跑时假红。
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/landing/landing-hero-")),
      page.reload(),
    ]);
    expect(response.status(), `主视觉应当可取到，实际 ${response.status()}`).toBeLessThan(400);
  });

  test("五个功能入口与两张 AI 卡都在", async ({ page }) => {
    await page.goto("/");
    for (const title of ["知识库", "笔记", "慕课", "任务", "协同文档"]) {
      await expect(page.getByRole("heading", { level: 3, name: title, exact: true })).toBeVisible();
    }
    for (const title of ["AI 问答", "PDF 问答"]) {
      await expect(page.getByRole("heading", { level: 3, name: title, exact: true })).toBeVisible();
    }
  });

  test("页内锚点导航能滚到对应区块", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "站内导航" }).getByText("AI 能力").click();
    // 锚点生效的判据是 URL 带上 hash，且目标区块进入视口
    await expect(page).toHaveURL(/#ai$/);
    await expect(page.locator("#ai")).toBeInViewport();
  });

  test("「免费开始」把访客带到注册页", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "免费开始" }).first().click();
    await expect(page).toHaveURL(/\/register/);
  });

  test("「登录」把访客带到登录页", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("手机 UA 的访客也看到落地页，而不是被分流到需要登录的移动端", async ({ browser }) => {
    // 用一个带手机 UA 的独立上下文：默认的 chromium project 是桌面 UA
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      storageState: { cookies: [], origins: [] },
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("landing-page")).toBeVisible();
    await expect(page).not.toHaveURL(/\/m\/dashboard/);
    await context.close();
  });

  test("横向不溢出（1440 桌面口径）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});

/**
 * 已登录视角：这些用例要用 global-setup 攒好的登录态，
 * 所以在这个 describe 里显式覆盖掉文件顶部的「无 Cookie」设置。
 */
test.describe("官网首页 · 已登录跳转", () => {
  test.use({ storageState: "./e2e/.auth/state.json" });

  test("已登录访问 / 被送回工作台，不停在营销页", async ({ page }) => {
    await page.goto("/");
    // 链路是 / → /dashboard → /notes，两步重定向都要发生
    await expect(page).toHaveURL(/\/notes/, { timeout: 30_000 });
    await expect(page.getByTestId("landing-page")).toHaveCount(0);
  });
});
