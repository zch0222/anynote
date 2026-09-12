import { type Page, expect, test } from "@playwright/test";

/**
 * 移动端关键路径（M10.5）。
 *
 * 只跑在 `--project=mobile`（Pixel 5：393×851 + Android Chrome UA）下。
 * 与桌面用例分文件，避免 `workers: 1` 下全量 E2E 时间翻倍。
 *
 * 前置：生产构建 + 真实 Docker 栈（见 README「启动指南」场景 A），协同用例还需
 * `anynote-collab` 容器在跑。登录态由 `global-setup` 预先攒好。
 */

const BASE_NAME = "E2E 移动端知识库";
const EDITOR_SURFACE = ".anynote-editor__content";

/** 所有非详情页的移动端路由——详情页要先有数据，放在各自用例里断言。 */
const MOBILE_ROUTES = [
  "/m/dashboard",
  "/m/notes",
  "/m/notes/new",
  "/m/docs",
  "/m/wikis",
  "/m/tasks",
  "/m/mooc",
  "/m/ai/chat",
  "/m/ai/pdf",
  "/m/search",
  "/m/me",
  "/m/settings/profile",
  "/m/settings/appearance",
];

/** 页面级横向溢出判定：留 1px 容差给亚像素取整。 */
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

/** 确保存在一个知识库，返回其名称。复用移动端自己的新建入口（与桌面同一个对话框）。 */
async function ensureMobileKnowledgeBase(page: Page): Promise<void> {
  await page.goto("/m/notes");
  const existing = page.getByRole("link", { name: new RegExp(BASE_NAME) });
  if ((await existing.count()) > 0) return;

  await page.getByRole("button", { name: /新建知识库/ }).click();
  await page.getByLabel("名称").fill(BASE_NAME);
  await page.getByLabel("简介").fill("移动端 E2E 自动创建");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByText(BASE_NAME).first()).toBeVisible({ timeout: 30_000 });
}

test.describe("移动端入口分流", () => {
  test("手机 UA 访问根路径落到移动端工作台", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/m\/dashboard/, { timeout: 30_000 });
    await expect(page.getByTestId("mobile-dashboard")).toBeVisible();
  });

  test("?desktop=1 能逃生到桌面版，并记住选择", async ({ page }) => {
    await page.goto("/dashboard?desktop=1");
    // 留在桌面路由，不被 UA 推回移动版
    await expect(page).toHaveURL(/\/dashboard\?desktop=1/);

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === "anynote_view")?.value).toBe("desktop");

    // 偏好生效后再访问根路径也不再跳转
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });

    // 清掉偏好，别影响后面的用例
    await page.context().clearCookies({ name: "anynote_view" });
  });
});

test.describe("移动端外壳与导航", () => {
  test("五个 tab 互相可达且高亮正确", async ({ page }) => {
    await page.goto("/m/dashboard");
    const tabBar = page.getByTestId("mobile-tab-bar");
    await expect(tabBar).toBeVisible();

    for (const [title, pattern] of [
      ["笔记", /\/m\/notes$/],
      ["文档", /\/m\/docs$/],
      ["AI", /\/m\/ai\/chat$/],
      ["我的", /\/m\/me$/],
      ["工作台", /\/m\/dashboard$/],
    ] as const) {
      await tabBar.getByRole("link", { name: title }).click();
      await expect(page).toHaveURL(pattern, { timeout: 30_000 });
      await expect(tabBar.getByRole("link", { name: title })).toHaveAttribute(
        "data-active",
        "true",
      );
    }
  });

  test("触摸目标不小于 40px", async ({ page }) => {
    await page.goto("/m/me");
    const targets = [
      page.getByTestId("mobile-logout"),
      page.getByTestId("view-switch"),
      page.getByTestId("me-settings-profile"),
    ];
    for (const target of targets) {
      const box = await target.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    }
  });

  for (const route of MOBILE_ROUTES) {
    test(`${route} 无横向滚动`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByTestId("mobile-content")).toBeVisible({ timeout: 30_000 });
      await expectNoHorizontalScroll(page);
    });
  }
});

test.describe("移动端笔记三级导航与编辑", () => {
  test.describe.configure({ mode: "serial" });

  let noteUrl = "";

  test("知识库 → 笔记列表 → 新建笔记 → 编辑器", async ({ page }) => {
    await ensureMobileKnowledgeBase(page);

    await page.getByRole("link", { name: new RegExp(BASE_NAME) }).click();
    await expect(page).toHaveURL(/\/m\/notes\/\d+$/, { timeout: 30_000 });

    await page.getByTestId("mobile-note-create").click();
    await expect(page).toHaveURL(/\/m\/notes\/new\?baseId=\d+/, { timeout: 30_000 });

    const title = `移动端笔记 ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("标题").fill(title);
    await page.getByRole("button", { name: "创建笔记" }).click();

    await expect(page).toHaveURL(/\/m\/notes\/\d+\/\d+/, { timeout: 30_000 });
    await expect(page.getByLabel("笔记标题")).toHaveValue(title, { timeout: 30_000 });
    noteUrl = page.url();
  });

  test("编辑器全屏：沉浸式路由不显示 tab bar", async ({ page }) => {
    expect(noteUrl, "上一条用例未能创建笔记").not.toBe("");
    await page.goto(noteUrl);
    await expect(page.locator(EDITOR_SURFACE)).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId("mobile-tab-bar")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test("输入自动保存，返回列表再进来内容还在", async ({ page }) => {
    expect(noteUrl, "上一条用例未能创建笔记").not.toBe("");
    await page.goto(noteUrl);

    const marker = `移动端自动保存 ${Date.now()}`;
    const surface = page.locator(EDITOR_SURFACE);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await surface.click();
    await page.keyboard.type(marker);

    await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("mobile-back").click();
    await expect(page).toHaveURL(/\/m\/notes\/\d+$/, { timeout: 30_000 });

    await page.goto(noteUrl);
    await expect(page.locator(EDITOR_SURFACE)).toContainText(marker, { timeout: 30_000 });
  });

  test("工具条单行横滑、按钮 ≥40px、更多弹层可开", async ({ page }) => {
    expect(noteUrl, "上一条用例未能创建笔记").not.toBe("");
    await page.goto(noteUrl);
    await expect(page.locator(EDITOR_SURFACE)).toBeVisible({ timeout: 30_000 });

    const toolbar = page.getByRole("toolbar", { name: "编辑器工具栏" });
    await expect(toolbar).toHaveAttribute("data-variant", "mobile");

    // 不换行：工具条自己横向可滚，但不把页面顶出横向滚动条
    const metrics = await toolbar.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      wrap: getComputedStyle(element).flexWrap,
    }));
    expect(metrics.wrap).toBe("nowrap");
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    await expectNoHorizontalScroll(page);

    const boldBox = await page.getByRole("button", { name: "加粗" }).boundingBox();
    expect(boldBox?.height ?? 0).toBeGreaterThanOrEqual(40);

    await page.getByRole("button", { name: "更多格式" }).click();
    await expect(page.getByTestId("editor-more-sheet")).toBeVisible();
    await expect(page.getByRole("button", { name: "表格" })).toBeVisible();
  });

  test("「移动到…」与删除走底部动作表", async ({ page }) => {
    expect(noteUrl, "上一条用例未能创建笔记").not.toBe("");
    await page.goto(noteUrl);
    await expect(page.locator(EDITOR_SURFACE)).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("mobile-note-actions").click();
    const sheet = page.getByTestId("mobile-action-sheet");
    await expect(sheet).toBeVisible();
    // 危险动作第一次点击只进确认态，不直接删
    await sheet.getByRole("button", { name: "删除笔记" }).click();
    await expect(sheet.getByRole("button", { name: "再点一次确认删除" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(noteUrl);
  });
});

test.describe("移动端 AI", () => {
  // 流式与 PDF 转存受 M7.6 后端缺口阻塞，这里只验收形态与降级路径
  test("会话列表可进新对话页并返回", async ({ page }) => {
    await page.goto("/m/ai/chat");
    await expect(page.getByTestId("mobile-conversations")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("mobile-conversation-new").click();
    await expect(page).toHaveURL(/\/m\/ai\/chat\/new$/, { timeout: 30_000 });
    // 对话页是沉浸式的，tab bar 让位给输入区
    await expect(page.getByTestId("mobile-tab-bar")).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.getByTestId("mobile-back").click();
    await expect(page).toHaveURL(/\/m\/ai\/chat$/, { timeout: 30_000 });
  });

  test("PDF 问答页有上传入口且不横向溢出", async ({ page }) => {
    await page.goto("/m/ai/pdf");
    await expect(page.getByTestId("mobile-pdf-list")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("mobile-pdf-upload")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("移动端搜索", () => {
  test("搜索页替代 ⌘K，可过滤并跳转", async ({ page }) => {
    await page.goto("/m/search");
    await expect(page.getByTestId("mobile-search")).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("搜索页面或操作").fill("任务");
    await page.getByRole("link", { name: /任务/ }).first().click();
    await expect(page).toHaveURL(/\/m\/tasks$/, { timeout: 30_000 });
  });
});
