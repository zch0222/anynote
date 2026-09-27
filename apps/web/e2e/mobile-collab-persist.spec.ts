import { devices, expect, test } from "@playwright/test";
import {
  EDITOR_SURFACE,
  OFFLINE_DETECT_MS,
  appendParagraph,
  createMobileNote,
  patchWithVersion,
  readHealth,
  readNote,
  waitRoomsClosed,
  waitStored,
  watchNotePatches,
} from "./support/collab-persist";

/**
 * 服务端落库在移动端视口下的联调（M14.5 第 13 条：第 1、2、8 条在移动端再跑一遍）。
 *
 * 只跑在 `--project=mobile` 下；协同服务没开 `COLLAB_SERVER_PERSIST` 时整组跳过。
 */
test.describe.configure({ mode: "serial" });

const BASE_NAME = "E2E 移动端落库库";

function stamp() {
  return Date.now().toString().slice(-6);
}

test.beforeAll(async ({ request }) => {
  const health = await readHealth(request);
  test.skip(!health.serverPersist, "需要 COLLAB_SERVER_PERSIST=true 的协同服务");
});

test("移动端：两个上下文同时编辑，库里包含双方内容，全程没有 PATCH", async ({ page, browser }) => {
  const patches = watchNotePatches(page);
  const { url, noteId } = await createMobileNote(page, BASE_NAME, `移动双人 ${stamp()}`);
  const second = await browser.newContext({ storageState: "./e2e/.auth/state.json" });
  const other = await second.newPage();
  try {
    await other.goto(url);
    await appendParagraph(page, "手机甲的一段");
    await expect(other.locator(EDITOR_SURFACE)).toContainText("手机甲的一段", { timeout: 15_000 });
    await appendParagraph(other, "手机乙的一段");
    await waitStored(page, noteId, ["手机甲的一段", "手机乙的一段"], 10_000);
    expect(patches).toEqual([]);
  } finally {
    await second.close();
  }
});

test("移动端：打开一篇老笔记不编辑就离开，更新时间不变", async ({ page, request }) => {
  const { url, noteId } = await createMobileNote(page, BASE_NAME, `移动只读 ${stamp()}`);
  await patchWithVersion(page, noteId, { content: "移动端没有一级标题的老笔记\n" });
  await page.goto("/m/notes");
  await waitRoomsClosed(request);
  const before = (await readNote(page, noteId)).updateTime;

  await page.goto(url);
  await expect(page.locator(EDITOR_SURFACE)).toContainText("移动端没有一级标题的老笔记", {
    timeout: 30_000,
  });
  await page.waitForTimeout(4_000);
  await page.goto("/m/notes");
  await waitRoomsClosed(request);
  expect((await readNote(page, noteId)).updateTime).toBe(before);
});

test("移动端：断网编辑后关页，恢复网络重新打开，改动进库", async ({ browser, request }) => {
  const context = await browser.newContext({
    ...devices["Pixel 5"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: "./e2e/.auth/state.json",
  });
  const page = await context.newPage();
  try {
    const { url, noteId } = await createMobileNote(page, BASE_NAME, `移动离线 ${stamp()}`);
    await appendParagraph(page, "手机在线的一段");
    await waitStored(page, noteId, ["手机在线的一段"]);

    await context.setOffline(true);
    // 断网不一定让已建立的 WebSocket 立即报错；y-websocket 靠 30 秒收不到消息判定断线（每 3 秒检查一次）
    await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "offline", {
      timeout: OFFLINE_DETECT_MS,
    });
    await appendParagraph(page, "手机断网写的一段");
    await expect(page.locator("[data-status]").first()).toHaveText("离线，改动已保存在本设备", {
      timeout: 10_000,
    });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.close({ runBeforeUnload: true });
    await context.setOffline(false);
    await waitRoomsClosed(request, 60_000);

    const reopened = await context.newPage();
    await reopened.goto(url);
    await expect(reopened.locator(EDITOR_SURFACE)).toContainText("手机断网写的一段", {
      timeout: 30_000,
    });
    await waitStored(reopened, noteId, ["手机在线的一段", "手机断网写的一段"]);
  } finally {
    await context.close();
  }
});
