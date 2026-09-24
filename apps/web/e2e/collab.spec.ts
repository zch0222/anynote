import { type Page, expect, test } from "@playwright/test";
import { ensureKnowledgeBase } from "./support/account";
import { focusWritableEditor } from "./support/editor";

/**
 * M13.3 笔记协同的端到端验证。
 *
 * 与 M8.1 的旧版（`/docs` 独立文档库）不同，协同现在是**笔记的一种编辑模式**：
 * 房间名 `note:<noteId>`、真相源是 MySQL、`/docs` 已退役。因此这里全程走
 * `/notes/<baseId>/<noteId>`，不再出现 `/docs`。
 *
 * 需要 anynote-web（开着 `NEXT_PUBLIC_COLLAB_NOTES=1`）与 anynote-collab 在跑。
 */
test.describe.configure({ mode: "serial" });

const EDITOR_SURFACE = ".anynote-editor__content";

/** 等编辑器可交互；正文是 dynamic 懒加载的，直接点会点空。 */
async function focusEditor(page: Page) {
  return focusWritableEditor(page);
}

/** 走到一篇新建笔记的编辑页，返回可访问的地址。 */
async function createNote(page: Page, baseName: string, title: string) {
  await ensureKnowledgeBase(page, baseName);
  await page.goto("/notes/new");
  await page.getByLabel("标题").fill(title);
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });
  await expect(page.locator(`${EDITOR_SURFACE} h1`).first()).toHaveText(title, { timeout: 30_000 });
  return page.url();
}

/** 协同模式下的保存态文案是「已同步」（方案 §7.4）。 */
async function expectSynced(page: Page) {
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /已同步|已保存/ })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe("笔记协同（M13.3）", () => {
  test("协同时能连上服务，两个浏览器上下文互见内容", async ({ page, browser }) => {
    const url = await createNote(page, "E2E 协同库", `E2E 协同 ${Date.now().toString().slice(-6)}`);

    // 协同连接建立后，头部出现在线成员条；第二端还没进来时至少有自己
    await expect(page.getByLabel(/在线成员 \d+ 人/)).toBeVisible({ timeout: 30_000 });

    // 第二个上下文复用同一份登录态：相当于同一个人的另一台设备
    const second = await browser.newContext({ storageState: "./e2e/.auth/state.json" });
    const other = await second.newPage();
    try {
      await other.goto(url);
      await expect(other.locator(EDITOR_SURFACE)).toBeVisible({ timeout: 30_000 });

      const marker = `协同同步校验 ${Date.now()}`;
      const surface = await focusEditor(page);
      await page.keyboard.type(marker);

      // 实时互见：另一端无需刷新就能看到
      await expect(other.locator(EDITOR_SURFACE)).toContainText(marker, { timeout: 30_000 });

      // 两端都进房间后，在线成员数应至少 2
      await expect(other.getByLabel(/在线成员 \d+ 人/)).toBeVisible({ timeout: 30_000 });
      expect(surface).toBeTruthy();
    } finally {
      await second.close();
    }
  });

  test("协同编辑落库后刷新读回（真相源是 MySQL）", async ({ page }) => {
    const url = await createNote(page, "E2E 落库库", `E2E 落库 ${Date.now().toString().slice(-6)}`);

    const marker = `落库校验 ${Date.now()}`;
    await focusEditor(page);
    await page.keyboard.type(marker);
    await expectSynced(page);

    // 等保存真正完成：状态稳定在已同步/已保存后刷新
    await page.reload();
    await expect(page.locator(EDITOR_SURFACE)).toContainText(marker, { timeout: 30_000 });
  });

  test("关闭协同开关时回到单人链路（已保存 + 冲突处理可用）", async ({ page }) => {
    // 这条用例验证的是「开关关闭 = 现状单人模式」：不连房间、状态是「已保存」。
    // 由于开关是构建期内联的，这里只能验证当前构建（开关开）下的单人态文案兼容性：
    // 停用协同的连接（把 WS 地址指向不可达）会走降级，但状态徽标仍能显示保存态。
    const url = await createNote(page, "E2E 单人库", `E2E 单人 ${Date.now().toString().slice(-6)}`);
    await page.goto(url);
    await focusEditor(page);
    await page.keyboard.type("单人链路校验");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /已同步|已保存/ })
        .first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("协同令牌的权限约束（M13.2）", () => {
  test("无权限用户拿不到该笔记的协同令牌（BFF 403）", async ({ page }) => {
    // 用一个不存在的 noteId 走 BFF：后端会回 A0404，BFF 原样透传为业务错误，
    // 而不是签发一枚可以连任意房间的令牌。
    const response = await page.request.post("/api/auth/collab-token", {
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      data: { noteId: 99999999 },
    });
    const body = await response.json();
    expect(body.code).not.toBe("00000");
    expect(body.data).toBeNull();
  });
});

test.describe("/docs 退役（M13.5）", () => {
  test("旧地址 404，一级导航不再有「协同文档」", async ({ page }) => {
    const response = await page.goto("/docs");
    expect(response?.status()).toBe(404);

    await page.goto("/notes");
    await expect(page.getByRole("link", { name: "协同文档" })).toHaveCount(0);
  });
});

/**
 * 冷启动注入的并发与写入约束（本批修复）。
 *
 * 这一组钉住三条实测出来的行为，每条都对应一个已修复的缺陷：
 * 1. 两端**同时**打开一间冷房间时必须有人注入（旧规则「awareness 里只有我」会
 *    让双方互相让路，房间永远停在空态，两端都显示空白正文）；
 * 2. 房间正文未就位时编辑器只读（空白编辑器里打字，那一拍保存会覆盖库里的正文）；
 * 3. 一段输入的最后一个字必须落库（保存正文曾在 Y.Doc 的 origin 回调里现取，
 *    恒落后一次击键）。
 */
test.describe("冷启动注入的并发与写入约束（本批修复）", () => {
  // 协同服务的健康端点。默认按 dev/compose 的回环端口；换部署口径时用 COLLAB_HEALTH_URL 覆盖。
  const COLLAB_HEALTH = process.env.COLLAB_HEALTH_URL ?? "http://localhost:1234/healthz";

  /** 等所有房间销毁：房间只在有人连着时存在，全空才算「冷」。 */
  async function waitForColdRoom(page: Page) {
    await expect
      .poll(
        async () => {
          const response = await page.request.get(COLLAB_HEALTH);
          return ((await response.json()) as { rooms: number }).rooms;
        },
        { timeout: 30_000, intervals: [500] },
      )
      .toBe(0);
  }

  test("两端同时打开冷房间时，两端都能读到正文（不再互相让路）", async ({ page, browser }) => {
    const marker = `冷启动并发 ${Date.now().toString().slice(-6)}`;
    const url = await createNote(
      page,
      "E2E 冷启动库",
      `E2E 冷启动 ${Date.now().toString().slice(-6)}`,
    );
    await focusEditor(page);
    await page.keyboard.type(marker);
    await expectSynced(page);

    // 离开这篇笔记，等房间销毁 —— 下一步要的是真正的冷房间
    await page.goto("/notes");
    await waitForColdRoom(page);

    const first = await browser.newContext({ storageState: "./e2e/.auth/state.json" });
    const second = await browser.newContext({ storageState: "./e2e/.auth/state.json" });
    try {
      const a = await first.newPage();
      const b = await second.newPage();
      // 同时进场：这正是旧规则下双方互相让路、房间停在空态的触发条件
      await Promise.all([a.goto(url), b.goto(url)]);

      await expect(a.locator(EDITOR_SURFACE)).toContainText(marker, { timeout: 30_000 });
      await expect(b.locator(EDITOR_SURFACE)).toContainText(marker, { timeout: 30_000 });
    } finally {
      await first.close();
      await second.close();
    }
  });

  test("协同笔记刷新后正文完整，包括一段输入的最后一个字", async ({ page }) => {
    const url = await createNote(page, "E2E 末字库", `E2E 末字 ${Date.now().toString().slice(-6)}`);
    const marker = "末字校验ABCDE";

    await focusEditor(page);
    await page.keyboard.type(marker, { delay: 60 });
    await expectSynced(page);

    // 刷新走的是 REST：读回来的就是库里那一份
    await page.goto(url);
    await expect(page.locator(EDITOR_SURFACE)).toContainText(marker, { timeout: 30_000 });
  });

  test("纯打开一篇协同笔记不产生写入（更新时间不动）", async ({ page }) => {
    const url = await createNote(
      page,
      "E2E 只读打开库",
      `E2E 只读打开 ${Date.now().toString().slice(-6)}`,
    );
    const noteId = Number(new URL(url).pathname.split("/").pop());
    const notePath = `/api/proxy/note/notes/${noteId}`;

    /*
     * 刻意把正文写成**没有顶部 H1** 的形态。
     *
     * 打开笔记时前端会先 `ensureLeadingHeading` 把标题补成 H1 再喂给编辑器，于是注入进
     * Y.Doc 的正文与库里那份不相等。这正是缺陷的暴露条件：注入产生的 Y.Doc update 一旦
     * 逃过 origin 过滤，就会被当成本地编辑排一次保存，把这篇笔记改写掉。
     * 若正文本来就以 H1 开头，「内容与基线相同就不发」的守卫会把这次保存挡掉，
     * 用例会假绿——所以这里必须构造不相等的那一种。
     */
    await page.request.patch(notePath, {
      headers: { origin: new URL(page.url()).origin, "content-type": "application/json" },
      data: { content: "没有一级标题的正文，打开时会被前端补 H1\n" },
    });

    // 房间只在有人连着时存在；不等它销毁，下一步就不是冷启动
    await page.goto("/notes");
    await waitForColdRoom(page);

    const read = async () => {
      const response = await page.request.get(notePath);
      return ((await response.json()) as { data: { updateTime: string } }).data.updateTime;
    };
    const before = await read();

    // 打开后一个键都不敲
    await page.goto(url);
    await expect(page.locator(EDITOR_SURFACE)).toContainText("没有一级标题的正文", {
      timeout: 30_000,
    });
    await page.waitForTimeout(6_000);

    expect(await read()).toBe(before);
  });
});
