import { expect, test } from "@playwright/test";
import { ensureKnowledgeBase } from "./support/account";
import { expectNoteSaved } from "./support/save-status";

/**
 * UI 走查 2026-11-11 的 E-01 / E-06 回归（桌面）。
 *
 * E-01：网关曾经把整包 JSON 请求体当 HTML 文本做实体转义，`>` 变 `&gt;`，
 * 引用块保存一次就退化成普通段落。这条用例走**真实的保存—刷新往返**，
 * 同时盯住 `<` 与 `&` 不会被转义成字面量。
 *
 * E-06：新建笔记在文档层只有一个 H1，此前既没有占位符也没有写作引导。
 */
test("引用块与 < & 在保存—刷新后保持原样（E-01）", async ({ page }) => {
  await ensureKnowledgeBase(page, "E2E 引用块往返");
  await page.goto("/notes/new");
  await page.getByLabel("标题").fill("引用块往返");
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });

  const surface = page.locator(".anynote-editor__content");
  await expect(surface).toBeVisible({ timeout: 30_000 });

  // 标题（H1）之后新起一段，用 Markdown 输入规则（"> "）造一个引用块
  await surface.locator("h1").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("> 引用文字");
  await expect(surface.locator("blockquote")).toHaveCount(1);

  // 再起一段写入 < 与 &：它们此前会被转义成 &lt; / &amp; 存进库
  await page.keyboard.press("Enter");
  await page.keyboard.type("1 < 2 & 3");
  await expectNoteSaved(page);

  await page.reload();
  const reloaded = page.locator(".anynote-editor__content");
  await expect(reloaded.locator("blockquote")).toHaveCount(1, { timeout: 30_000 });
  await expect(reloaded.locator("blockquote")).toContainText("引用文字");
  await expect(reloaded).toContainText("1 < 2 & 3");

  // 字面量实体不该出现在正文里（那正是结构丢失后的样子）
  await expect(reloaded).not.toContainText("&gt;");
  await expect(reloaded).not.toContainText("&lt;");
  await expect(reloaded).not.toContainText("&amp;");
});

test("新建笔记给出空态写作引导，开始输入后消失（E-06）", async ({ page }) => {
  await ensureKnowledgeBase(page, "E2E 空态引导");
  await page.goto("/notes/new");
  await page.getByLabel("标题").fill("空态引导");
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });

  const surface = page.locator(".anynote-editor__content");
  await expect(surface).toBeVisible({ timeout: 30_000 });

  const hint = page.locator(".anynote-empty-body-hint");
  await expect(hint).toBeVisible({ timeout: 30_000 });
  await expect(hint).toContainText("唤起命令");

  await surface.locator("h1").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("正文开始");
  await expect(hint).toHaveCount(0);
});
