import { expect, test } from "@playwright/test";

test.describe("关键路径 6：暗色切换", () => {
  test("切到暗色后 html 上挂 dark 类，刷新后保持", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "切换主题" }).click();
    await page.getByRole("menuitemradio", { name: "暗色" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("切回亮色后 dark 类被移除", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "切换主题" }).click();
    await page.getByRole("menuitemradio", { name: "亮色" }).click();

    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
