import { type Page, expect } from "@playwright/test";

/**
 * 笔记保存徽标的断言口径。
 *
 * **为什么不能用 `hasText: "已保存"`**：协同模式（`NEXT_PUBLIC_COLLAB_NOTES=1` +
 * 该笔记有编辑权）下，徽标连上房间时文案是 **「已同步」**（方案 §7.4）——
 * 正文由在场所有人共同推进，本地 `lastSavedAt` 与本房间是否同步无关，
 * 停在「已保存 12 分钟前」会让用户以为内容没同步。两者都是"与服务器一致"的终态，
 * 差别只在协同连接是否存在，用例不该把其中一个写死。
 *
 * 判据取 `<output data-status>` 而不是文案：`save-status.tsx` 把
 * `NoteSaveStatus`（saved / pending / saving / offline / error / conflict）
 * 直接写进 `data-status`，它与文案、与协同连接**都**无关，是这套状态机唯一稳定的锚点。
 * 之前 `loading-system.spec.ts` 已经这么用（`[data-status="saved"]`），这里统一成公共实现。
 *
 * `collabConnected` 只影响 `saved` 那一个态的文案（`save-status.tsx` 的
 * `collabConnected && status === "saved"`），所以传不传都不影响本断言的判定。
 */
export async function expectNoteSaved(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.locator('[data-status="saved"]').first()).toBeVisible({ timeout });
}

/**
 * 等保存徽标稳定在「已保存 / 已同步」终态，并返回它读到的文案。
 *
 * 需要断言**具体文案**的用例用它（例如校验协同开关开着时确实说「已同步」），
 * 只关心"存完了"的用例用 `expectNoteSaved` 即可。
 */
export async function readSaveBadgeText(page: Page, timeout = 30_000): Promise<string> {
  await expectNoteSaved(page, timeout);
  const badge = page.locator('[data-status="saved"]').first();
  return ((await badge.textContent()) ?? "").trim();
}
