import { expect, test } from "@playwright/test";
import { ensureKnowledgeBase, openKnowledgeBase } from "./support/account";
import { EDITOR_SURFACE, createNote, focusEnd } from "./support/collab-persist";

/**
 * 桌面侧栏收起 / 展开。
 *
 * 偏好存在 localStorage（`anynote-ui`），每条用例是新的浏览器上下文，互不串味。
 */
const BASE_NAME = "E2E 侧栏库";

test.describe("侧栏收起", () => {
  test("收起后内容区占满整宽，刷新后仍收起；从顶栏展开后恢复", async ({ page }) => {
    await page.goto("/notes");
    const sidebar = page.getByTestId("app-sidebar");
    const content = page.locator("main[data-slot='sidebar-inset']");
    await expect(sidebar).toBeVisible({ timeout: 30_000 });
    const expandedWidth = (await content.boundingBox())?.width ?? 0;

    await page.getByRole("button", { name: "收起侧边栏" }).click();
    await expect(sidebar).toBeHidden();
    // 侧栏 272 宽整个让出来，而不是留一条窄轨
    await expect
      .poll(async () => (await content.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(expandedWidth + 272);

    await page.reload();
    const expand = page.getByTestId("app-header").getByRole("button", { name: "展开侧边栏" });
    await expect(expand).toBeVisible({ timeout: 30_000 });
    await expect(sidebar).toBeHidden();

    await expand.click();
    await expect(sidebar).toBeVisible();
    await expect(expand).toBeHidden();
  });

  test("没有顶栏的知识库页：收起后从内容区左上展开，按钮不压住页头标题", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
    await openKnowledgeBase(page, BASE_NAME);
    await expect(page.getByTestId("app-header")).toHaveCount(0);
    const expand = page.getByRole("button", { name: "展开侧边栏" });
    await expect(expand).toBeHidden();

    await page.getByRole("button", { name: "收起侧边栏" }).click();
    await expect(page.getByTestId("app-sidebar")).toBeHidden();
    await expect(expand).toBeVisible();

    const button = await expand.boundingBox();
    const title = await page.getByTestId("kb-page-title").boundingBox();
    expect(button && title).toBeTruthy();
    if (button && title) expect(button.x + button.width).toBeLessThanOrEqual(title.x);

    await expand.click();
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
  });

  /*
   * 回归：侧栏快捷键不看事件是否已被编辑器处理，编辑器里每加粗一次就翻转一次侧栏偏好。
   */
  test("编辑器里 Cmd / Ctrl + B 是加粗，不会收起侧栏；编辑区外才切换侧栏", async ({ page }) => {
    await createNote(page, BASE_NAME, `侧栏快捷键 ${Date.now().toString().slice(-6)}`);
    const sidebar = page.getByTestId("app-sidebar");
    await expect(sidebar).toBeVisible();

    await focusEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("ControlOrMeta+b");
    await page.keyboard.type("加粗的字");
    await expect(page.locator(`${EDITOR_SURFACE} strong`)).toHaveText("加粗的字");
    await expect(sidebar).toBeVisible();

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("ControlOrMeta+b");
    await expect(sidebar).toBeHidden();
  });
});
