import { expect, test } from "@playwright/test";
import { ensureKnowledgeBase } from "./support/account";

const BASE_NAME = "E2E 知识库";
const NOTE_TITLE = `E2E 笔记 ${Date.now().toString().slice(-6)}`;

// 第二条用例直接复用第一条创建出来的笔记地址：serial 模式下同一个 worker，
// 模块级变量能传下去，比再从列表里点一遍稳得多。
let noteUrl = "";

test.describe.configure({ mode: "serial" });

test.describe("关键路径 2/3：创建笔记与编辑保存", () => {
  test("创建笔记后跳进编辑器", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);

    await page.goto("/notes/new");
    await page.getByLabel("标题").fill(NOTE_TITLE);
    await page.getByRole("button", { name: "创建笔记" }).click();

    // 创建成功会跳到 /notes/<baseId>/<noteId>
    await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });
    await expect(page.getByLabel("笔记标题")).toHaveValue(NOTE_TITLE, { timeout: 30_000 });
    noteUrl = page.url();
  });

  test("在编辑器里输入会自动保存，刷新后内容还在", async ({ page }) => {
    expect(noteUrl, "上一条用例未能创建笔记").not.toBe("");
    await page.goto(noteUrl);

    const marker = `自动保存校验 ${Date.now()}`;
    const surface = page.locator(".anynote-editor__content");
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await surface.click();
    await page.keyboard.type(marker);

    // 保存状态机：待保存 → 保存中 → 已保存
    await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible({
      timeout: 30_000,
    });

    await page.reload();
    await expect(page.locator(".anynote-editor__content")).toContainText(marker, {
      timeout: 30_000,
    });
  });

  test("新建的笔记出现在知识库的笔记列表里", async ({ page }) => {
    await page.goto("/notes");
    await page
      .getByRole("link", { name: new RegExp(BASE_NAME) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/notes\/\d+$/, { timeout: 30_000 });
    await expect(page.getByText(NOTE_TITLE).first()).toBeVisible({ timeout: 30_000 });
  });
});
