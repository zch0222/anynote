import { expect, test } from "@playwright/test";
import {
  EDITOR_SURFACE,
  appendParagraph,
  createMobileNote,
  forceSingleUser,
  waitStored,
} from "./support/collab-persist";
import { expectNoteSaved } from "./support/save-status";

/**
 * 移动端单人保存链路的离开拦截：返回键是按钮（`router.back()`），不走链接拦截，
 * 需要单独验证离线时点返回键会先确认。
 */
test("离线时有未保存改动，点返回键先确认；取消就留在本页，恢复联网后改动照常保存", async ({
  page,
  context,
}) => {
  await forceSingleUser(page);
  const { url, noteId } = await createMobileNote(
    page,
    "E2E 移动单人库",
    `移动离开拦截 ${Date.now().toString().slice(-6)}`,
  );
  await appendParagraph(page, "联网时写的一段");
  await expectNoteSaved(page);

  await context.setOffline(true);
  await appendParagraph(page, "断网时写的一段");
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "offline", {
    timeout: 10_000,
  });

  const messages: string[] = [];
  page.once("dialog", (dialog) => {
    messages.push(dialog.message());
    void dialog.dismiss();
  });
  await page.getByTestId("mobile-back").click();
  await expect.poll(() => messages).toEqual(["改动尚未保存，离开后会丢失。确定离开吗？"]);
  await page.waitForTimeout(500);
  expect(page.url()).toBe(url);
  await expect(page.locator(EDITOR_SURFACE)).toContainText("断网时写的一段");

  await context.setOffline(false);
  await expectNoteSaved(page);
  await waitStored(page, noteId, ["联网时写的一段", "断网时写的一段"]);
});

test("离线时确认离开只弹一次确认，不再追加浏览器自带的离开提示", async ({ page, context }) => {
  await forceSingleUser(page);
  const { url } = await createMobileNote(
    page,
    "E2E 移动单人库",
    `移动确认离开 ${Date.now().toString().slice(-6)}`,
  );
  await appendParagraph(page, "联网时写的一段");
  await expectNoteSaved(page);

  await context.setOffline(true);
  await appendParagraph(page, "断网时写的一段");
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "offline", {
    timeout: 10_000,
  });

  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });
  await page.getByTestId("mobile-back").click();
  // 离线时这次返回会退化成整页加载，站内确认之后不该再弹浏览器的离开提示
  await expect.poll(() => page.url(), { timeout: 10_000 }).not.toBe(url);
  await page.waitForTimeout(1_000);
  expect(dialogs).toEqual(["confirm"]);
  await context.setOffline(false);
});
