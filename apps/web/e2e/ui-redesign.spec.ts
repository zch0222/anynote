import { type Page, expect, test } from "@playwright/test";
import { ensureKnowledgeBase, openKnowledgeBase } from "./support/account";

/**
 * 新前端 UI 重设计的端到端验收。
 *
 * 覆盖设计稿里三条最容易"实现走样"的约束：
 *   1. 信息架构 —— 知识库是唯一顶层对象，四类子资源是它的二级 Tab
 *   2. 设计系统 —— 语义 Token 在浅/深两态都生效，渐变封面按 id 稳定分配
 *   3. 版式 —— 侧栏/顶栏/画廊/编辑器头部的关键结构真的存在
 *
 * 与 `notes.spec.ts` 一样跑在真实生产构建 + Docker 全栈上。
 */

const BASE_NAME = "E2E 重设计知识库";

/** TipTap 正文的可编辑面（编辑器整包是 dynamic 懒加载的，等它就等于等编辑器就绪）。 */
const EDITOR_SURFACE = ".anynote-editor__content";

/**
 * 切换主题。
 *
 * 必须等菜单**完全收起**再开下一次：Base UI 的下拉在选中后会做一段收起动画，
 * 紧接着点触发按钮时旧菜单项还在 DOM 上，`click()` 会拿到一个正在被卸载的元素，
 * 于是报 "element was detached from the DOM"。这是用例的节奏问题不是产品缺陷。
 */
async function setTheme(page: Page, label: "浅色" | "深色" | "跟随系统") {
  const menu = page.getByRole("menu");
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitemradio", { name: label }).click();
  await expect(menu).toBeHidden();
}

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

test.describe.configure({ mode: "serial" });

test.describe("设计系统：语义 Token", () => {
  test("浅色与深色下语义 Token 取值不同，且都驱动了实际样式", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("app-sidebar")).toBeVisible({ timeout: 30_000 });

    const tokens = () =>
      page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const body = getComputedStyle(document.body);
        return {
          surface: root.getPropertyValue("--surface-grouped").trim(),
          label: root.getPropertyValue("--label-primary").trim(),
          accent: root.getPropertyValue("--accent-primary").trim(),
          // 字阶：正文 15px（设计规范 Body · 15/24）
          bodyFontSize: body.fontSize,
          bodyLineHeight: body.lineHeight,
        };
      });

    const light = await tokens();
    expect(light.surface).not.toBe("");
    expect(light.label).not.toBe("");
    expect(light.accent).not.toBe("");
    // 设计规范把正文基线定在 15px / 24px
    expect(light.bodyFontSize).toBe("15px");
    expect(light.bodyLineHeight).toBe("24px");

    await setTheme(page, "深色");
    await expect(page.locator("html")).toHaveClass(/dark/);

    const dark = await tokens();
    expect(dark.surface).not.toBe(light.surface);
    expect(dark.label).not.toBe(light.label);
    expect(dark.accent).not.toBe(light.accent);
    // 字阶不随主题变化——它属于排版不属于配色
    expect(dark.bodyFontSize).toBe(light.bodyFontSize);

    await setTheme(page, "浅色");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});

test.describe("信息架构：知识库是唯一顶层对象", () => {
  test("侧栏一级导航只有知识库与跨库能力，四类子资源降为二级 Tab", async ({ page }) => {
    await page.goto("/notes");
    const navigation = page.getByRole("navigation", { name: "主导航" });
    await expect(navigation).toBeVisible({ timeout: 30_000 });

    // 跨库能力保留在一级
    await expect(navigation.getByRole("link", { name: "AI 对话" })).toHaveAttribute(
      "href",
      "/ai/chat",
    );
    await expect(navigation.getByRole("link", { name: "协同文档" })).toHaveAttribute(
      "href",
      "/docs",
    );
    // 旧的四平铺入口不再作为一级导航项
    await expect(navigation.getByRole("link", { name: "工作台" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "慕课" })).toHaveCount(0);
    await expect(navigation.getByRole("link", { name: "任务" })).toHaveCount(0);
  });

  test("知识库内的二级 Tab 可达，且「笔记」是默认落地页", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
    const url = page.url();
    const baseId = /\/notes\/(\d+)/.exec(url)?.[1];
    expect(baseId, `未能从 ${url} 解析知识库 id`).toBeTruthy();

    const tabs = page.getByRole("navigation", { name: "知识库内容" });
    await expect(tabs.getByRole("link", { name: "笔记" })).toHaveAttribute(
      "href",
      `/notes/${baseId}`,
    );
    await expect(tabs.getByRole("link", { name: "笔记" })).toHaveAttribute("aria-current", "page");

    // 概览 Tab 能打开
    await tabs.getByRole("link", { name: "概览" }).click();
    await expect(page).toHaveURL(new RegExp(`/notes/${baseId}/overview$`), { timeout: 30_000 });
    await expect(page.getByTestId("kb-overview")).toBeVisible({ timeout: 30_000 });

    // 成员 Tab 能打开
    await page
      .getByRole("navigation", { name: "知识库内容" })
      .getByRole("link", { name: "成员" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/notes/${baseId}/members$`), { timeout: 30_000 });
    await expect(page.getByTestId("kb-members")).toBeVisible({ timeout: 30_000 });
  });

  test("顶栏在知识库内给切换器与 Tab，在知识库外退回面包屑", async ({ page }) => {
    await openKnowledgeBase(page, BASE_NAME);
    await expect(page.getByTestId("kb-switcher")).toHaveAttribute("href", "/notes");

    await page.goto("/ai/chat");
    await expect(page.getByRole("navigation", { name: "面包屑" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("kb-switcher")).toHaveCount(0);
  });
});

test.describe("知识库画廊", () => {
  test("卡片网格有渐变封面，且分段筛选可切换", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery-grid")).toBeVisible({ timeout: 30_000 });

    // 渐变封面：卡片头部的背景必须是渐变而不是纯色
    const cover = page.locator("[data-testid^='kb-card-'] span.kb-cover").first();
    await expect(cover).toBeVisible();
    const background = await cover.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.backgroundImage;
    });
    expect(background).toContain("linear-gradient");

    // 网格末尾有「新建知识库」卡（它触发对话框，不是链接）
    const createCard = page.getByTestId("kb-create-card");
    await createCard.scrollIntoViewIfNeeded();
    await expect(createCard).toBeVisible();

    // 三个分段都能点，且切换后网格仍然在（不炸成空态）
    const segmented = page.getByRole("radiogroup", { name: "知识库范围" });
    await expect(segmented.getByRole("radio", { name: "全部" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await segmented.getByRole("radio", { name: "我的" }).click();
    await expect(segmented.getByRole("radio", { name: "我的" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await segmented.getByRole("radio", { name: "组织" }).click();
    await expect(segmented.getByRole("radio", { name: "组织" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await segmented.getByRole("radio", { name: "全部" }).click();
    await expect(page.getByTestId("kb-gallery-grid")).toBeVisible();

    await expectNoHorizontalScroll(page);
  });

  test("渐变按知识库 id 稳定分配——同一个库两次进来颜色一致", async ({ page }) => {
    await openKnowledgeBase(page, BASE_NAME);
    const baseId = /\/notes\/(\d+)/.exec(page.url())?.[1];
    expect(baseId).toBeTruthy();

    const gradientOf = async () => {
      await page.goto("/notes");
      const cover = page.getByTestId(`kb-card-${baseId}`).locator("span.kb-cover");
      await expect(cover).toBeVisible({ timeout: 30_000 });
      return cover.evaluate((element) => getComputedStyle(element).backgroundImage);
    };

    const first = await gradientOf();
    const second = await gradientOf();
    expect(second).toBe(first);
    expect(first).toContain("linear-gradient");
  });

  test("新建知识库走 ?new=1，创建后跳进新库", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    const name = `E2E 新建库 ${Date.now().toString().slice(-6)}`;
    await page.getByTestId("gallery-new-base").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("名称").fill(name);
    await page.getByRole("button", { name: "创建", exact: true }).click();

    await expect(page).toHaveURL(/\/notes\/\d+$/, { timeout: 30_000 });
    await expect(page.getByTestId("kb-switcher")).toContainText(name, { timeout: 30_000 });
  });
});

test.describe("笔记列表与编辑器版式", () => {
  test.describe.configure({ mode: "serial" });

  /**
   * 本组共用一个知识库地址。
   *
   * 每轮 E2E 都新建账号，但同一轮里会留下多个名字含 `E2E 重设计知识库` 的库
   * （eg. `E2E 重设计知识库` 与它同前缀的兄弟）。`openKnowledgeBase` 按名字
   * 正则取 first，条目顺序变化时可能落到**另一个**库，于是"上一条用例建了笔记"
   * 的前提断掉。捕获一次地址、后续直接复用，才能让 serial 组真的串起来。
   */
  const noteTitle = `重设计版式笔记 ${Date.now().toString().slice(-6)}`;
  let baseUrl = "";

  test("在知识库里新建一篇笔记，供后续版式用例使用", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
    if (!/\/notes\/\d+$/.test(page.url())) await openKnowledgeBase(page, BASE_NAME);
    // **必须在创建笔记之前**捕获：创建成功后地址会变成 `/notes/<base>/<note>`，
    // 那时再取 url 存下来的就是编辑器地址，后续用例 `goto` 它会跳过列表页。
    baseUrl = new URL(page.url()).pathname;

    await expect(page.getByTestId("note-list")).toBeVisible({ timeout: 30_000 });
    const existing = page.getByTestId("note-list-items").getByRole("link");
    // 列表可能在加载中，`count()` 不会等待——先等"要么有行、要么出现空态"再判断
    await expect(existing.first().or(page.getByText("这个知识库还没有笔记"))).toBeVisible({
      timeout: 30_000,
    });
    if ((await existing.count()) > 0) return;

    await page.getByTestId("note-create").click();
    await page.getByLabel("标题").fill(noteTitle);
    // 对话框里的提交按钮是「创建」（标题是「新建笔记」）
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });

    // 新笔记必须落在**同一个**知识库下，否则后续用例在 baseUrl 上看不到它。
    // 这条断言同时也是对"创建对话框用的是列表页给的知识库 id"的回归护栏。
    const createdPath = new URL(page.url()).pathname;
    expect(
      createdPath.startsWith(`${baseUrl}/`),
      `新笔记落在了 ${createdPath}，与列表页 ${baseUrl} 不在同一知识库下`,
    ).toBe(true);

    /*
     * 写一行正文再回列表。
     *
     * 这一笔不是"为了过测试"——它对应真实用法（建完就写），而且**当前后端只有
     * 写过内容才会让笔记出现在列表里**：`GET /notes` 的 `selectNoteList`
     * 是 `FROM n_note_operation_log LEFT JOIN n_note`，而 `n_note_operation_log`
     * 只由 RocketMQ 消费者在**内容 diff 非空**时写入（见 `NoteMessageListener`）。
     * 所以一篇"建完没动过"的空笔记查询结果里没有它。这是既有的后端缺陷，
     * 与本次前端重设计无关（`NoteMapper.xml` 未改动），已记录待单独修复。
     */
    const surface = page.locator(EDITOR_SURFACE);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await surface.click();
    await page.keyboard.type("列出这篇笔记");
    await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(baseUrl);
    await expect(page.getByTestId("note-list-items").getByRole("link").first()).toBeVisible({
      timeout: 30_000,
    });
  });
  test("笔记列表是行列表而不是卡片，且能进编辑器", async ({ page }) => {
    expect(baseUrl, "上一条用例未能定位知识库").not.toBe("");
    await page.goto(baseUrl);

    await expect(page.getByTestId("note-list")).toBeVisible({ timeout: 30_000 });
    const rows = page.getByTestId("note-list-items").getByRole("link");
    // `count()` 不会自动等待——列表还在加载时它读到的是 0。用可等待的断言，
    // 上一条用例保证了这里确实有笔记。
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });

    await rows.first().click();
    await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });
    await expect(page.locator(".anynote-editor__content")).toBeVisible({ timeout: 30_000 });
  });

  test("编辑器头部：保存徽标 + 元信息行 + 标题，正文纸面有宽度上限", async ({ page }) => {
    expect(baseUrl, "上一条用例未能定位知识库").not.toBe("");
    await page.goto(baseUrl);
    const firstRow = page.getByTestId("note-list-items").getByRole("link").first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });
    await firstRow.click();
    await expect(page.locator(".anynote-editor__content")).toBeVisible({ timeout: 30_000 });

    // 保存状态是胶囊徽标（有底色、有圆角），不是一行裸文字
    const badge = page.getByRole("status").filter({ hasText: "已保存" });
    await expect(badge).toBeVisible({ timeout: 30_000 });
    const badgeStyle = await badge.evaluate((element) => {
      const style = getComputedStyle(element);
      return { radius: style.borderRadius, background: style.backgroundColor };
    });
    expect(badgeStyle.radius).not.toBe("0px");
    expect(badgeStyle.background).not.toBe("rgba(0, 0, 0, 0)");

    // 标题可编辑 + 元信息行（字数 + 所属知识库）
    await expect(page.getByLabel("笔记标题")).toBeVisible();
    await expect(page.getByTestId("note-char-count")).toHaveText(/\d+ 字/);

    // 正文纸面限宽：一行超过约 75 字符后回行会丢行，所以容器必须有 max-width
    const articleWidth = await page.evaluate(() => {
      const article = document.querySelector<HTMLElement>('[data-testid="note-document"]');
      return article ? article.getBoundingClientRect().width : null;
    });
    expect(articleWidth).not.toBeNull();
    expect(articleWidth ?? 0).toBeLessThanOrEqual(820);
    // 也不该窄成一条——限宽不等于缩水
    expect(articleWidth ?? 0).toBeGreaterThan(400);

    await expectNoHorizontalScroll(page);
  });

  test("编辑器有左侧目录（知识库 → 笔记两层）", async ({ page }) => {
    expect(baseUrl, "上一条用例未能定位知识库").not.toBe("");
    await page.goto(baseUrl);
    const firstRow = page.getByTestId("note-list-items").getByRole("link").first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });
    await firstRow.click();
    await expect(page.locator(".anynote-editor__content")).toBeVisible({ timeout: 30_000 });

    const tree = page.getByRole("navigation", { name: "笔记目录" });
    await expect(tree).toBeVisible();
    await expect(tree.getByRole("link", { name: new RegExp(BASE_NAME) })).toBeVisible();
  });
});
