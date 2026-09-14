import { expect, test } from "@playwright/test";
import { replaceLeadingHeading } from "./support/editor";

/**
 * 移动端与桌面共用一套标题规则：**没有独立的标题输入行**，
 * 标题就是正文的第一个一级标题（见 `lib/leading-heading.ts`）。
 * 这条用例盯的是"改 H1 → 标题、列表、刷新后全都跟着变"。
 */
test("移动端顶部 H1 即笔记标题，列表与刷新后仍一致", async ({ page }) => {
  await page.goto("/m/notes");
  // 移动端新建入口是顶栏右侧的圆形「+」
  await page.getByTestId("mobile-base-create").click();
  await page.getByLabel("名称").fill("E2E 移动标题");
  await page.getByLabel("简介").fill("标题同步回归");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  // 创建后直接落进新库的笔记页
  await expect(page).toHaveURL(/\/m\/notes\/\d+$/, { timeout: 30_000 });
  await page.getByTestId("mobile-note-create").click();
  await page.getByLabel("标题").fill("移动原始标题");
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/m\/notes\/\d+\/\d+/, { timeout: 30_000 });

  const surface = page.locator(".anynote-editor__content");
  await expect(surface).toBeVisible({ timeout: 30_000 });
  // 创建时填的标题以一级标题落到正文首节点；没有并存的标题输入框
  await expect(surface.locator("h1").first()).toHaveText("移动原始标题");
  await expect(page.getByLabel("笔记标题")).toHaveCount(0);

  await replaceLeadingHeading(page, "移动同步标题");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(surface.locator("h1")).toHaveText("移动同步标题");

  // 新建页在浏览器历史中；先从列表进入，才能验证返回列表后的标题。
  const basePath = new URL(page.url()).pathname.replace(/\/\d+$/, "");
  await page.goto(basePath);
  await page.getByRole("link", { name: /移动同步标题/ }).click();
  await expect(surface.locator("h1")).toHaveText("移动同步标题");
  await replaceLeadingHeading(page, "移动更新标题");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.getByTestId("mobile-back").click();
  await expect(page).toHaveURL(/\/m\/notes\/\d+$/);
  await page.getByRole("link", { name: /移动更新标题/ }).click();
  await expect(surface.locator("h1")).toHaveText("移动更新标题");
});
