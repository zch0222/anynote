import { type Page, expect } from "@playwright/test";

/**
 * 切换主题。
 *
 * 必须等菜单**完全收起**再开下一次：Base UI 的下拉在选中后会做一段收起动画，
 * 紧接着点触发按钮时旧菜单项还在 DOM 上，`click()` 会拿到一个正在被卸载的元素，
 * 于是报 "element was detached from the DOM"。这是用例的节奏问题不是产品缺陷。
 *
 * 放在 support 里由 `theme.spec.ts` 与 `notes.spec.ts` 共用：后者的代码块用例
 * 要跨两态各量一次计算样式，复制一份 helper 迟早会漂移。
 */
export async function setTheme(page: Page, label: "浅色" | "深色" | "跟随系统") {
  const menu = page.getByRole("menu");
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitemradio", { name: label }).click();
  await expect(menu).toBeHidden();
}
