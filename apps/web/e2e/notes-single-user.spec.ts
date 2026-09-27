import { expect, test } from "@playwright/test";
import {
  EDITOR_SURFACE,
  appendParagraph,
  createNote,
  forceSingleUser,
  patchWithVersion,
  readNote,
  waitStored,
} from "./support/collab-persist";
import { replaceLeadingHeading } from "./support/editor";
import { expectNoteSaved } from "./support/save-status";

/**
 * 单人模式缺陷修复（M14.P）的端到端回归。
 *
 * 构建打开了协同开关时，让协同令牌签发失败即可退回单人模式（协同降级），
 * 保存走 `PATCH /notes/{id}` 的客户端链路。
 */
test.describe.configure({ mode: "serial" });

test("① 冲突时选「放弃我的改动」：编辑器载入服务端内容，离开页面后也不会把本地改动写回", async ({
  page,
}) => {
  await forceSingleUser(page);
  const { noteId } = await createNote(
    page,
    "E2E 单人库",
    `放弃改动 ${Date.now().toString().slice(-6)}`,
  );
  await appendParagraph(page, "第一次保存的内容");
  await expectNoteSaved(page);

  // 另一个写入方抢先改了这篇笔记
  const title = (await readNote(page, noteId)).title;
  await patchWithVersion(page, noteId, { title, content: `# ${title}\n\n别人写入的内容` });

  await appendParagraph(page, "本地想要放弃的改动");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "放弃我的改动" }).click();

  await expect(page.locator(EDITOR_SURFACE)).toContainText("别人写入的内容", { timeout: 10_000 });
  await expect(page.locator(EDITOR_SURFACE)).not.toContainText("本地想要放弃的改动");

  await page.goto("/notes");
  await page.waitForTimeout(3_000);
  const stored = (await readNote(page, noteId)).content;
  expect(stored).toContain("别人写入的内容");
  expect(stored).not.toContain("本地想要放弃的改动");
});

test("② 顶部标题超过 80 字时仍能保存，标题截断到 80 字", async ({ page }) => {
  await forceSingleUser(page);
  const { noteId } = await createNote(
    page,
    "E2E 单人库",
    `长标题 ${Date.now().toString().slice(-6)}`,
  );
  const longTitle = `长标题${"题".repeat(100)}`;

  await replaceLeadingHeading(page, longTitle);
  await appendParagraph(page, "长标题笔记的正文");
  await expectNoteSaved(page);

  const stored = await readNote(page, noteId);
  expect(stored.title).toBe(longTitle.slice(0, 80));
  expect(stored.content).toContain("长标题笔记的正文");
  expect(stored.content).toContain(longTitle);
});

test("③ 离线时有未保存改动，点站内链接先确认；取消就留在本页，恢复联网后改动照常保存", async ({
  page,
  context,
}) => {
  await forceSingleUser(page);
  const { url, noteId } = await createNote(
    page,
    "E2E 单人库",
    `离开拦截 ${Date.now().toString().slice(-6)}`,
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
  const notePath = new URL(url).pathname;
  const basePath = notePath.replace(/\/\d+$/, "");
  await page.locator(`a[href="${basePath}"]`).first().click();
  await expect.poll(() => messages).toEqual(["改动尚未保存，离开后会丢失。确定离开吗？"]);
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe(notePath);
  await expect(page.locator(EDITOR_SURFACE)).toContainText("断网时写的一段");

  await context.setOffline(false);
  await expectNoteSaved(page);
  await waitStored(page, noteId, ["联网时写的一段", "断网时写的一段"]);
});

test("④ Cmd / Ctrl + S 立即保存：不等防抖直接发出保存请求，并拦下浏览器的「网页另存为」", async ({
  page,
}) => {
  await forceSingleUser(page);
  const { noteId } = await createNote(
    page,
    "E2E 单人库",
    `快捷键保存 ${Date.now().toString().slice(-6)}`,
  );
  await appendParagraph(page, "快捷键之前的一段");
  await expectNoteSaved(page);

  // 原生另存为对话框 Playwright 看不到，改在冒泡阶段记下默认动作是否已被拦下
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() !== "s") return;
      document.documentElement.dataset.e2eSavePrevented = String(event.defaultPrevented);
    });
  });
  await page.keyboard.type("，紧接着按下快捷键");
  // 防抖是 1.5 秒：1 秒内等到请求，说明是快捷键触发的而不是防抖到期
  const patched = page.waitForRequest(
    (request) => request.method() === "PATCH" && request.url().includes("/api/proxy/note/notes/"),
    { timeout: 1_000 },
  );
  await page.keyboard.press("ControlOrMeta+s");
  await patched;

  await expect(page.locator("html")).toHaveAttribute("data-e2e-save-prevented", "true");
  await expectNoteSaved(page);
  await waitStored(page, noteId, ["快捷键之前的一段，紧接着按下快捷键"]);
});
