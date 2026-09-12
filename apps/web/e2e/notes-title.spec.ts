import { expect, test } from "@playwright/test";
import { ensureKnowledgeBase } from "./support/account";
import { replaceLastParagraph, replaceLeadingHeading } from "./support/editor";

test("顶部一级标题同步笔记标题、目录和刷新后的内容", async ({ page }) => {
  await ensureKnowledgeBase(page, "E2E 标题同步");
  await page.goto("/notes/new");
  await page.getByLabel("标题").fill("初始笔记标题");
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });

  const surface = page.locator(".anynote-editor__content");
  await expect(surface).toBeVisible({ timeout: 30_000 });
  await expect(surface.locator("h1").first()).toHaveText("初始笔记标题");
  await replaceLeadingHeading(page, "同步后的标题");
  const title = page.getByLabel("笔记标题");
  await expect(title).toHaveValue("同步后的标题");
  await replaceLastParagraph(page, "正文保持独立");

  const notePath = new URL(page.url()).pathname;
  const treeLink = page.locator(`a[href="${notePath}"]`);
  await expect(treeLink).toHaveText("同步后的标题");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(title).toHaveValue("同步后的标题");
  await expect(surface.locator("h1")).toHaveText("同步后的标题");
  await expect(surface).toContainText("正文保持独立");

  // 修改已有 H1；标题与正文必须由同一份草稿保存。
  await replaceLeadingHeading(page, "再次修改标题");
  await expect(title).toHaveValue("再次修改标题");
  await expect(treeLink).toHaveText("再次修改标题");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(title).toHaveValue("再次修改标题");
  await expect(surface.locator("h1")).toHaveText("再次修改标题");

  // 手动命名后，只修改正文不能把标题改回原来的 H1。
  await title.fill("手动笔记标题");
  await replaceLastParagraph(page, "继续编辑正文");
  await expect(title).toHaveValue("手动笔记标题");
  await expect(treeLink).toHaveText("手动笔记标题");
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(title).toHaveValue("手动笔记标题");
  await expect(surface).toContainText("继续编辑正文");
});
