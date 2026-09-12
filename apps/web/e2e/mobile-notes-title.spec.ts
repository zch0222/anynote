import { expect, test } from "@playwright/test";
import { replaceLeadingHeading } from "./support/editor";

test("移动端顶部 H1 同步笔记标题，返回列表和刷新后仍一致", async ({ page }) => {
  await page.goto("/m/notes");
  await page.getByRole("button", { name: /新建知识库/ }).click();
  await page.getByLabel("名称").fill("E2E 移动标题");
  await page.getByLabel("简介").fill("标题同步回归");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("link", { name: /E2E 移动标题/ }).click();
  await page.getByTestId("mobile-note-create").click();
  await page.getByLabel("标题").fill("移动原始标题");
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/m\/notes\/\d+\/\d+/, { timeout: 30_000 });

  const surface = page.locator(".anynote-editor__content");
  await expect(surface).toBeVisible({ timeout: 30_000 });
  await expect(surface.locator("h1").first()).toHaveText("移动原始标题");
  await replaceLeadingHeading(page, "移动同步标题");
  await expect(page.getByLabel("笔记标题")).toHaveValue("移动同步标题");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("笔记标题")).toHaveValue("移动同步标题");
  await expect(surface.locator("h1")).toHaveText("移动同步标题");

  // 新建页在浏览器历史中；先从列表进入，才能验证返回列表后的标题。
  const basePath = new URL(page.url()).pathname.replace(/\/\d+$/, "");
  await page.goto(basePath);
  await page.getByRole("link", { name: /移动同步标题/ }).click();
  await expect(surface.locator("h1")).toHaveText("移动同步标题");
  await replaceLeadingHeading(page, "移动更新标题");
  await expect(page.getByLabel("笔记标题")).toHaveValue("移动更新标题");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.getByTestId("mobile-back").click();
  await expect(page).toHaveURL(/\/m\/notes\/\d+$/);
  await page.getByRole("link", { name: /移动更新标题/ }).click();
  await expect(page.getByLabel("笔记标题")).toHaveValue("移动更新标题");
  await expect(surface.locator("h1")).toHaveText("移动更新标题");
});
