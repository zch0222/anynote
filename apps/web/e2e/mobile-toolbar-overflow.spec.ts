import { expect, test } from "@playwright/test";

/**
 * UI 走查 2026-11-11 的 E-03 回归（移动端）。
 *
 * 360px 视口下 8 个 40px 常驻按钮已经 392px，溢出入口若也待在横滑区里，
 * 只会露出 16px——「更多格式」背后的 15 个命令几乎等于不可达。
 * 现在「更多」固定在右端，任何宽度下都应完整可见，并且仍然能打开弹层。
 */
test("320 / 360 / 375 / 393 下「更多格式」完整可见且可点（E-03）", async ({ page }) => {
  await page.goto("/m/notes");
  await page.getByTestId("mobile-base-create").click();
  await page.getByLabel("名称").fill("E2E 窄屏工具栏");
  await page.getByLabel("简介").fill("工具栏几何");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page).toHaveURL(/\/m\/notes\/\d+$/, { timeout: 30_000 });

  await page.getByTestId("mobile-note-create").click();
  await page.getByLabel("标题").fill("窄屏工具栏");
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/m\/notes\/\d+\/\d+/, { timeout: 30_000 });

  const toolbar = page.getByRole("toolbar", { name: "编辑器工具栏" });
  await expect(toolbar).toBeVisible({ timeout: 30_000 });

  const more = toolbar.getByTestId("editor-toolbar-more").getByRole("button", {
    name: "更多格式",
  });

  for (const width of [320, 360, 375, 393]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(more).toBeVisible();
    await expect(more).toBeInViewport();

    const box = await more.boundingBox();
    expect(box, `${width}px 下量不到「更多格式」的盒子`).not.toBeNull();
    expect(box?.x, `${width}px 下入口左缘越界`).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0), `${width}px 下入口右缘越界`).toBeLessThanOrEqual(
      width,
    );
  }

  await more.click();
  await expect(page.getByTestId("editor-more-sheet")).toBeVisible();
});
