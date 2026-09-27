import { type Page, expect, test } from "@playwright/test";
import {
  COLLAB_CONTAINER,
  EDITOR_SURFACE,
  NOTE_CONTAINER,
  OFFLINE_DETECT_MS,
  appendParagraph,
  createNote,
  docker,
  focusEnd,
  mysql,
  occurrences,
  patchWithVersion,
  readHealth,
  readNote,
  waitCollabHealthy,
  waitRoomsClosed,
  waitStored,
  watchNotePatches,
} from "./support/collab-persist";

/**
 * 服务端落库（方案 docs/collab-persistence，M14.5）的联调与故障演练。
 *
 * 前置：anynote-web 以 `NEXT_PUBLIC_COLLAB_NOTES=1` 构建，anynote-collab 打开
 * `COLLAB_SERVER_PERSIST=true`。故障演练直接操作本机 Docker 容器（kill / stop / pause），
 * 因此只在本机开发栈上跑，协同服务没开落库时整组跳过。
 */
test.describe.configure({ mode: "serial" });

const BASE = "E2E 落库库";

function stamp() {
  return Date.now().toString().slice(-6);
}

async function badge(page: Page) {
  return page.locator("[data-status]").first();
}

test.beforeAll(async ({ request }) => {
  const health = await readHealth(request);
  test.skip(!health.serverPersist, "需要 COLLAB_SERVER_PERSIST=true 的协同服务");
});

test.describe("联调：协同服务落库", () => {
  test("两个浏览器上下文同时编辑，10 秒内库里包含双方内容，全程没有 PATCH", async ({
    page,
    browser,
  }) => {
    const patches = watchNotePatches(page);
    const { url, noteId } = await createNote(page, BASE, `双人 ${stamp()}`);
    const second = await browser.newContext({ storageState: "./e2e/.auth/state.json" });
    const other = await second.newPage();
    const otherPatches = watchNotePatches(other);
    try {
      await other.goto(url);
      await appendParagraph(page, "甲写的一段");
      await expect(other.locator(EDITOR_SURFACE)).toContainText("甲写的一段", { timeout: 15_000 });
      await appendParagraph(other, "乙写的一段");

      await waitStored(page, noteId, ["甲写的一段", "乙写的一段"], 10_000);
      await expect(await badge(page)).toHaveAttribute("data-status", "synced");
      expect(patches).toEqual([]);
      expect(otherPatches).toEqual([]);
    } finally {
      await second.close();
    }
  });

  test("打开一篇老笔记不编辑就离开，更新时间不变", async ({ page, request }) => {
    const { url, noteId } = await createNote(page, BASE, `只读打开 ${stamp()}`);
    // 没有顶部 H1 的正文：打开时会被规范化，但规范化本身不能触发写库
    await patchWithVersion(page, noteId, { content: "没有一级标题的老笔记正文\n" });
    await page.goto("/notes");
    await waitRoomsClosed(request);
    const before = (await readNote(page, noteId)).updateTime;

    await page.goto(url);
    await expect(page.locator(EDITOR_SURFACE)).toContainText("没有一级标题的老笔记正文", {
      timeout: 30_000,
    });
    await page.waitForTimeout(4_000);
    await page.goto("/notes");
    await waitRoomsClosed(request);

    expect((await readNote(page, noteId)).updateTime).toBe(before);
  });

  test("编辑中外部带版本号写入：房间里立即出现外部改动，双方改动都进库", async ({ page }) => {
    const { noteId } = await createNote(page, BASE, `外部写入 ${stamp()}`);
    await appendParagraph(page, "房间里的第一段");
    await waitStored(page, noteId, ["房间里的第一段"]);

    const current = await readNote(page, noteId);
    await patchWithVersion(page, noteId, {
      content: `${current.content}\n\nCLI 追加的一段`,
    });
    // M14.7：外部写入通知让在线房间立即合并
    await expect(page.locator(EDITOR_SURFACE)).toContainText("CLI 追加的一段", { timeout: 3_000 });

    await appendParagraph(page, "房间里的第二段");
    await waitStored(page, noteId, ["房间里的第一段", "CLI 追加的一段", "房间里的第二段"]);
    const stored = (await readNote(page, noteId)).content;
    expect(occurrences(stored, "CLI 追加的一段")).toBe(1);
  });

  test("房间在线时恢复历史版本：房间内容变为恢复后的版本，之后的编辑正常落库", async ({ page }) => {
    const { noteId } = await createNote(page, BASE, `恢复历史 ${stamp()}`);
    await appendParagraph(page, "将被恢复覆盖的一段");
    await waitStored(page, noteId, ["将被恢复覆盖的一段"]);
    const title = (await readNote(page, noteId)).title;

    // 与历史页「恢复此版本」相同：取当前版本号，写回历史版本的标题与正文
    await patchWithVersion(page, noteId, { title, content: `# ${title}\n\n历史版本的正文` });
    await expect(page.locator(EDITOR_SURFACE)).toContainText("历史版本的正文", { timeout: 5_000 });
    await expect(page.locator(EDITOR_SURFACE)).not.toContainText("将被恢复覆盖的一段");

    await appendParagraph(page, "恢复之后的编辑");
    await waitStored(page, noteId, ["历史版本的正文", "恢复之后的编辑"]);
    expect((await readNote(page, noteId)).content).not.toContain("将被恢复覆盖的一段");
  });
});

test.describe("故障演练", () => {
  test("协同服务被 kill -9 后重启，客户端重连，正文不翻倍、不丢失", async ({ page, request }) => {
    const { noteId } = await createNote(page, BASE, `崩溃 ${stamp()}`);
    await appendParagraph(page, "崩溃前已落库的一段");
    await waitStored(page, noteId, ["崩溃前已落库的一段"]);

    docker(`kill -s KILL ${COLLAB_CONTAINER}`);
    docker(`start ${COLLAB_CONTAINER}`);
    await waitCollabHealthy(request);
    await expect(await badge(page)).toHaveAttribute("data-status", "synced", { timeout: 30_000 });

    await appendParagraph(page, "重连之后的一段");
    await waitStored(page, noteId, ["崩溃前已落库的一段", "重连之后的一段"]);
    const stored = (await readNote(page, noteId)).content;
    expect(occurrences(stored, "崩溃前已落库的一段")).toBe(1);
    await expect(page.locator(EDITOR_SURFACE)).toContainText("崩溃前已落库的一段");
    expect(
      occurrences((await page.locator(EDITOR_SURFACE).textContent()) ?? "", "崩溃前已落库的一段"),
    ).toBe(1);
  });

  test("docker stop 协同服务时，最后 2 秒内的输入已经落库", async ({ page, request }) => {
    const { noteId } = await createNote(page, BASE, `停机 ${stamp()}`);
    await appendParagraph(page, "停机前刚敲完的一段");
    // 不等防抖，等服务端确认后立刻停机
    await expect(await badge(page)).toHaveAttribute("data-status", "synced", { timeout: 10_000 });
    docker(`stop -t 30 ${COLLAB_CONTAINER}`);

    expect((await readNote(page, noteId)).content).toContain("停机前刚敲完的一段");
    docker(`start ${COLLAB_CONTAINER}`);
    await waitCollabHealthy(request);
  });

  test("note 服务不可用时持续编辑：徽标仍是已同步，/healthz 报出失败房间；期间重启协同服务，恢复后从应急落盘补写", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { noteId } = await createNote(page, BASE, `故障 ${stamp()}`);
    await appendParagraph(page, "故障前的一段");
    await waitStored(page, noteId, ["故障前的一段"]);

    docker(`pause ${NOTE_CONTAINER}`);
    try {
      await appendParagraph(page, "note 服务停机期间写的");
      await expect(await badge(page)).toHaveAttribute("data-status", "synced", { timeout: 10_000 });
      await expect
        .poll(async () => (await readHealth(request)).failingRooms?.map((item) => item.room), {
          timeout: 60_000,
          intervals: [1_000],
        })
        .toContain(`note:${noteId}`);

      // 停机期间重启协同服务：退出时写库失败，状态进应急落盘
      docker(`restart -t 30 ${COLLAB_CONTAINER}`);
      await waitCollabHealthy(request);
    } finally {
      docker(`unpause ${NOTE_CONTAINER}`);
    }

    await waitStored(page, noteId, ["故障前的一段", "note 服务停机期间写的"], 90_000);
    const stored = (await readNote(page, noteId)).content;
    expect(occurrences(stored, "note 服务停机期间写的")).toBe(1);
    expect(stored).toMatch(/^# 故障 \d+\n\n故障前的一段\n\nnote 服务停机期间写的$/);
  });

  test("断网后继续编辑：徽标离线并提示已保存在本设备，关页后恢复网络重新打开，改动进库", async ({
    browser,
    request,
  }) => {
    const context = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      storageState: "./e2e/.auth/state.json",
    });
    const page = await context.newPage();
    try {
      const { url, noteId } = await createNote(page, BASE, `离线 ${stamp()}`);
      await appendParagraph(page, "在线时的一段");
      await waitStored(page, noteId, ["在线时的一段"]);

      await context.setOffline(true);
      // 断网不一定让已建立的 WebSocket 立即报错；y-websocket 靠 30 秒收不到消息判定断线（每 3 秒检查一次）
      await expect(await badge(page)).toHaveAttribute("data-status", "offline", {
        timeout: OFFLINE_DETECT_MS,
      });
      await appendParagraph(page, "断网期间写的一段");
      await expect(await badge(page)).toHaveText("离线，改动已保存在本设备", { timeout: 10_000 });

      // 关页：改动只在本设备的 IndexedDB 里
      page.on("dialog", (dialog) => void dialog.accept());
      await page.close({ runBeforeUnload: true });
      await context.setOffline(false);
      await waitRoomsClosed(request, 60_000);

      const reopened = await context.newPage();
      await reopened.goto(url);
      await expect(reopened.locator(EDITOR_SURFACE)).toContainText("断网期间写的一段", {
        timeout: 30_000,
      });
      await waitStored(reopened, noteId, ["在线时的一段", "断网期间写的一段"]);
    } finally {
      await context.close();
    }
  });

  test("删除协同状态行后客户端重连：谱系不符（4409）重建会话，正文不翻倍", async ({
    page,
    request,
  }) => {
    const { noteId } = await createNote(page, BASE, `谱系 ${stamp()}`);
    await appendParagraph(page, "谱系重建前的一段");
    await waitStored(page, noteId, ["谱系重建前的一段"]);
    await expect
      .poll(() => mysql(`SELECT COUNT(*) FROM n_note_collab_state WHERE note_id = ${noteId}`))
      .toBe("1");

    mysql(`DELETE FROM n_note_collab_state WHERE note_id = ${noteId}`);
    docker(`kill -s KILL ${COLLAB_CONTAINER}`);
    docker(`start ${COLLAB_CONTAINER}`);
    await waitCollabHealthy(request);

    await expect(await badge(page)).toHaveAttribute("data-status", "synced", { timeout: 30_000 });
    await appendParagraph(page, "重建之后的一段");
    await waitStored(page, noteId, ["谱系重建前的一段", "重建之后的一段"]);
    const stored = (await readNote(page, noteId)).content;
    expect(occurrences(stored, "谱系重建前的一段")).toBe(1);
    expect(
      occurrences((await page.locator(EDITOR_SURFACE).textContent()) ?? "", "谱系重建前的一段"),
    ).toBe(1);
  });

  test("编辑器版本与协同服务不一致（4426）：编辑器只读并提示刷新", async ({ page }) => {
    const { url } = await createNote(page, BASE, `版本 ${stamp()}`);
    await page.routeWebSocket(/:1234\//, (ws) => {
      ws.close({ code: 4426, reason: "editor-version:999" });
    });
    await page.goto(url);

    await expect(page.getByTestId("collab-outdated")).toBeVisible({ timeout: 30_000 });
    await expect(await badge(page)).toHaveText("有新版本，请刷新页面");
    await expect(page.locator(EDITOR_SURFACE).first()).toHaveAttribute("contenteditable", "false");
  });

  test("标签页切到后台并闲置满 5 分钟：连接断开、房间落库关闭；回到前台自动重连", async ({
    page,
    request,
  }) => {
    await page.clock.install();
    const { noteId } = await createNote(page, BASE, `闲置 ${stamp()}`);
    await appendParagraph(page, "闲置前的一段");
    await waitStored(page, noteId, ["闲置前的一段"]);

    const setVisibility = (state: "hidden" | "visible") =>
      page.evaluate((value) => {
        Object.defineProperty(document, "visibilityState", { value, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);

    await setVisibility("hidden");
    await page.clock.fastForward("05:01");
    await waitRoomsClosed(request);

    await setVisibility("visible");
    await expect.poll(async () => (await readHealth(request)).rooms, { timeout: 30_000 }).toBe(1);
    await expect(await badge(page)).toHaveAttribute("data-status", "synced", { timeout: 30_000 });
  });

  test("长文（60KB，正文列上限附近）：开房与落库耗时在门槛内", async ({ page }) => {
    test.setTimeout(180_000);
    const { url, noteId } = await createNote(page, BASE, `长文 ${stamp()}`);
    const paragraph = `这是一段用于性能验证的正文，包含**加粗**、\`代码\` 与 [[双链]]。${"长".repeat(60)}`;
    // n_note_text.content 是 TEXT（上限 65535 字节），写不进 200KB；取接近上限的 60KB
    let body = "";
    while (new TextEncoder().encode(body).length < 60 * 1024) body += `${paragraph}\n\n`;
    await patchWithVersion(page, noteId, { content: `# 长文\n\n${body}` });
    await page.goto("/notes");

    const openStarted = Date.now();
    await page.goto(url);
    // 本地副本的谱系来自外部写入之前（这篇笔记还没写回过 Y 状态），服务端会以 4409 让客户端重建；
    // 等服务端接受并完成同步再输入，计时也就包含了重建
    await expect(await badge(page)).toHaveAttribute("data-status", "synced", { timeout: 30_000 });
    await focusEnd(page);
    const openMs = Date.now() - openStarted;

    const storeStarted = Date.now();
    await page.keyboard.press("Enter");
    await page.keyboard.type("长文末尾追加");
    await waitStored(page, noteId, ["长文末尾追加"], 60_000);
    const storeMs = Date.now() - storeStarted;

    console.log(`[60KB] 打开到可编辑 ${openMs}ms，编辑到落库 ${storeMs}ms`);
    expect(openMs).toBeLessThan(20_000);
    expect(storeMs).toBeLessThan(20_000);
  });
});
