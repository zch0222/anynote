import { type Page, expect, test } from "@playwright/test";

/**
 * 移动端视口回归（M10.0）。
 *
 * 只跑在 `--project=mobile`（Pixel 5）下，断言的是「body 不会横向滚动」这一类
 * 结构性缺陷——它一旦出现，整页在手机上就会左右晃，属于 P0。
 * 单测量不到这个：jsdom 没有真实布局，只能断言产生溢出的类名条件。
 */

/** 页面级横向溢出判定：文档滚动宽度不应超过可视宽度（留 1px 容差给亚像素取整）。 */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      widest: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1)
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 120)),
    };
  });
  expect(
    overflow.scrollWidth,
    `横向溢出，最先越界的元素：${overflow.widest.join(" | ") || "（未定位到）"}`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.describe("窄屏无横向滚动", () => {
  // UI_INVENTORY P0-1：文档库（288px）与问答（w-full + shrink-0）原来并排放在同一行 flex 里，
  // 两者宽度之和恒大于手机视口。修复后 < lg 改为单栏 + 顶部切换。
  test("/ai/pdf 在手机视口下不横向滚动", async ({ page }) => {
    await page.goto("/ai/pdf");
    await expect(page.getByTestId("pdf-chat-page")).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page);
  });

  test("/ai/pdf 切到问答面板后仍不横向滚动", async ({ page }) => {
    await page.goto("/ai/pdf");
    await expect(page.getByTestId("pdf-chat-page")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("tab", { name: "问答" }).click();
    await expect(page.getByTestId("pdf-pane-chat")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  // 414×896（iPhone 11 Pro Max 级）与 768（平板竖屏，落桌面窄屏形态）各取一档，
  // 覆盖 lg 断点两侧：断点写错时这两条会一起红。
  for (const width of [414, 768]) {
    test(`/ai/pdf 在 ${width}px 宽下不横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/ai/pdf");
      await expect(page.getByTestId("pdf-chat-page")).toBeVisible({ timeout: 30_000 });
      await expectNoHorizontalScroll(page);
    });
  }
});
