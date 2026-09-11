import { expect, test } from "@playwright/test";

/**
 * M8.1 协同编辑的端到端验证：两个浏览器上下文连同一个房间，
 * 一端输入另一端立刻看到。需要 anynote-collab 容器在跑。
 */
test.describe.configure({ mode: "serial" });

test.describe("协同编辑（M8.1）", () => {
  test("新建协同文档后进入编辑页并连上协同服务", async ({ page }) => {
    await page.goto("/docs");

    const newDoc = page.getByRole("button", { name: /新建文档/ });
    await expect(newDoc).toBeEnabled({ timeout: 30_000 });
    await newDoc.click();

    const title = `E2E 协同 ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("标题").fill(title);
    await page.getByRole("button", { name: "创建", exact: true }).click();

    await expect(page).toHaveURL(/\/docs\/[0-9a-zA-Z_-]{8,}/, { timeout: 30_000 });
    await expect(page.getByRole("status").filter({ hasText: "已连接" }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("一端输入的内容实时出现在另一端", async ({ page, browser }) => {
    await page.goto("/docs");
    const newDoc = page.getByRole("button", { name: /新建文档/ });
    await expect(newDoc).toBeEnabled({ timeout: 30_000 });
    await newDoc.click();
    await page.getByLabel("标题").fill(`E2E 双端 ${Date.now().toString().slice(-6)}`);
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/[0-9a-zA-Z_-]{8,}/, { timeout: 30_000 });

    const url = page.url();
    // 第二个上下文复用同一份登录态，相当于同一个人的另一台设备
    const second = await browser.newContext({ storageState: "./e2e/.auth/state.json" });
    const other = await second.newPage();
    try {
      await other.goto(url);
      await expect(other.locator(".anynote-editor__content")).toBeVisible({ timeout: 30_000 });

      const marker = `协同同步校验 ${Date.now()}`;
      const surface = page.locator(".anynote-editor__content");
      await expect(surface).toBeVisible({ timeout: 30_000 });
      await surface.click();
      await page.keyboard.type(marker);

      await expect(other.locator(".anynote-editor__content")).toContainText(marker, {
        timeout: 30_000,
      });
    } finally {
      await second.close();
    }
  });
});
