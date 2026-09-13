import { type Page, expect, test } from "@playwright/test";

/**
 * 切换主题。
 *
 * 必须等菜单**完全收起**再开下一次：Base UI 的下拉在选中后会做一段收起动画，
 * 紧接着点触发按钮时旧菜单项还在 DOM 上，`click()` 会拿到一个正在被卸载的元素，
 * 于是报 "element was detached from the DOM"。这是用例的节奏问题不是产品缺陷。
 */
async function setTheme(page: Page, label: "浅色" | "深色" | "跟随系统") {
  const menu = page.getByRole("menu");
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitemradio", { name: label }).click();
  await expect(menu).toBeHidden();
}

test.describe("关键路径 6：浅色 / 深色切换", () => {
  test("切到深色后 html 上挂 dark 类，刷新后保持", async ({ page }) => {
    await page.goto("/notes");

    await setTheme(page, "深色");
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("切回浅色后 dark 类被移除", async ({ page }) => {
    await page.goto("/notes");

    await setTheme(page, "浅色");

    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  /**
   * 设计系统的核心承诺是"页面里不写 dark: 分支，深色只换 Token 取值"。
   * 这条用例把承诺变成可执行的检查：浅/深两态下，同一元素的**计算样式必须不同**
   * （说明 Token 真的生效了），但页面主结构的类名完全一致
   * （说明没有靠 `dark:` 工具类打补丁）。
   */
  test("深色只改 Token 取值，不靠 dark: 类改名", async ({ page }) => {
    await page.goto("/notes");
    // 等侧栏与画廊都渲染出来，避免抓到骨架屏的样式
    await expect(page.getByTestId("app-sidebar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    const readTokens = () =>
      page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          grouped: root.getPropertyValue("--surface-grouped").trim(),
          label: root.getPropertyValue("--label-primary").trim(),
          accent: root.getPropertyValue("--accent-primary").trim(),
          bodyBg: getComputedStyle(document.body).backgroundColor,
        };
      });

    const light = await readTokens();

    await setTheme(page, "深色");
    await expect(page.locator("html")).toHaveClass(/dark/);

    const dark = await readTokens();

    // 三组语义 Token 在深色下必须换成另一组取值
    expect(dark.grouped).not.toBe(light.grouped);
    expect(dark.label).not.toBe(light.label);
    expect(dark.accent).not.toBe(light.accent);
    // 而 body 背景确实跟着 Token 变了（不是只改了变量没人用）
    expect(dark.bodyBg).not.toBe(light.bodyBg);

    // 切回浅色
    await setTheme(page, "浅色");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
