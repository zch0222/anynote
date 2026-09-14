import { expect, test } from "@playwright/test";
import { ensureKnowledgeBase } from "./support/account";
import { replaceLastParagraph, replaceLeadingHeading } from "./support/editor";

/**
 * 笔记**没有独立的标题输入行**：标题就是正文的第一个一级标题
 * （见 `lib/leading-heading.ts`）。所以这一条盯两件事：
 * 「改 H1 → 标题 / 目录 / 刷新后全都跟着变」，以及「只改正文不会动标题」。
 */
test("顶部一级标题即笔记标题，同步目录、刷新后与正文一起留存", async ({ page }) => {
  await ensureKnowledgeBase(page, "E2E 标题同步");
  await page.goto("/notes/new");
  await page.getByLabel("标题").fill("初始笔记标题");
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });

  const surface = page.locator(".anynote-editor__content");
  await expect(surface).toBeVisible({ timeout: 30_000 });
  // 创建时填的标题以一级标题落到正文首节点——新建笔记与历史笔记走同一条补齐逻辑
  await expect(surface.locator("h1").first()).toHaveText("初始笔记标题");
  await expect(page.getByLabel("笔记标题")).toHaveCount(0);

  await replaceLeadingHeading(page, "同步后的标题");
  await replaceLastParagraph(page, "正文保持独立");

  const notePath = new URL(page.url()).pathname;
  const treeLink = page.locator(`a[href="${notePath}"]`);
  // 目录行是「标题 + 更新于…」两行，所以断言收敛到标题那一行而不是整个链接
  await expect(treeLink.getByText("同步后的标题", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(surface.locator("h1")).toHaveText("同步后的标题");
  await expect(surface).toContainText("正文保持独立");

  // 修改已有 H1；标题与正文必须由同一份草稿保存。
  await replaceLeadingHeading(page, "再次修改标题");
  await expect(treeLink.getByText("再次修改标题", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible();
  await page.reload();
  await expect(surface.locator("h1")).toHaveText("再次修改标题");

  // 只改正文（不碰顶部 H1）不能动标题——标题的唯一来源就是首节点 H1。
  await replaceLastParagraph(page, "继续编辑正文");
  await expect(treeLink.getByText("再次修改标题", { exact: true })).toBeVisible();
  await expect(surface).toContainText("继续编辑正文");
});
