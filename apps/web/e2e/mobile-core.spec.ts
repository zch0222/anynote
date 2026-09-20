import { type Page, expect, test } from "@playwright/test";
import { establishFreshSession } from "./support/session";

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
  // 列表是客户端取数的：`count()` 不会等待，还在加载时会读到 0 而重复建库
  const list = page.getByTestId("mobile-note-bases");
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list).not.toHaveAttribute("data-state", "loading", { timeout: 30_000 });

  const existing = page.getByRole("link", { name: new RegExp(BASE_NAME) });
  if ((await existing.count()) > 0) return;

  // 移动端新建入口是顶栏右侧的圆形「+」，用 testid 定位
  await page.getByTestId("mobile-base-create").click();
  await page.getByLabel("名称").fill(BASE_NAME);
  await page.getByLabel("简介").fill("移动端 E2E 自动创建");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  // 创建后会跳进新库的笔记页
  await expect(page).toHaveURL(/\/m\/notes\/\d+$/, { timeout: 30_000 });
}

test.describe("移动端入口分流", () => {
  test("手机 UA 访问根路径落到移动端工作台", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/m\/dashboard/, { timeout: 30_000 });
    await expect(page.getByTestId("mobile-dashboard")).toBeVisible();
  });

  test("?desktop=1 能逃生到桌面版，并记住选择", async ({ page }) => {
    await page.goto("/dashboard?desktop=1");
    // 留在桌面形态，不被 UA 推回移动版；/dashboard 会重定向到画廊，query 要跟着走
    await expect(page).toHaveURL(/\/notes\?desktop=1/, { timeout: 30_000 });

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === "anynote_view")?.value).toBe("desktop");

    // 偏好生效后再访问根路径也不再跳转
    await page.goto("/");
    await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

    // 清掉偏好，别影响后面的用例
    await page.context().clearCookies({ name: "anynote_view" });
  });
});

test.describe("移动端会话保活", () => {
  /**
   * 复现「移动端刷新之后登录状态丢了」：`at` 是带 `expires` 的 httpOnly Cookie，
   * 过期后浏览器直接删掉它，而寿命两倍的 `rt` 还在。整页刷新（切后台回来、标签页
   * 被杀重开都算）必须仍能进工作台——由页面加载时的 `/api/auth/me` 用 `rt` 换新
   * `at`，而不是被中间件 307 踢回登录页。
   */
  test("at 过期（仅剩 rt）时整页刷新仍保持登录，并换回新 at", async ({ page }) => {
    // refresh 会吊销旧 rt，共享 storageState 里的凭据只能用一次；
    // 这里现场登录换一对新 Cookie 再模拟「浏览器已删除过期 at」
    await establishFreshSession(page);
    await page.context().clearCookies({ name: "at" });

    await page.goto("/m/dashboard");
    await expect(page).toHaveURL(/\/m\/dashboard$/, { timeout: 30_000 });
    await expect(page.getByTestId("mobile-dashboard")).toBeVisible({ timeout: 30_000 });

    // /api/auth/me 已用 rt 续期并写回新的 at Cookie（httpOnly，只能从上下文读）
    const at = (await page.context().cookies()).find((cookie) => cookie.name === "at");
    expect(at, "at 应已随续期重新写入").toBeDefined();
    expect((at?.expires ?? 0) * 1000).toBeGreaterThan(Date.now());
  });

  test("仅剩无效 rt 时整页刷新最终仍回到登录页", async ({ page }) => {
    // 中间件对「有 rt」放行是信任 BFF 会验真伪；这里证明验伪后仍会被送回登录页
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "rt", value: "not-a-valid-jwt", url: baseURL }]);

    await page.goto("/m/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });
});

test.describe("移动端外壳与导航", () => {
  test("四个 tab 互相可达且高亮正确", async ({ page }) => {
    await page.goto("/m/dashboard");
    const tabBar = page.getByTestId("mobile-tab-bar");
    await expect(tabBar).toBeVisible();

    for (const [title, pattern] of [
      ["知识库", /\/m\/notes$/],
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

  test("选中格是 accent 实心胶囊，未选中格是透明底", async ({ page }) => {
    await page.goto("/m/notes");
    const tabBar = page.getByTestId("mobile-tab-bar");
    const active = tabBar.getByRole("link", { name: "知识库" });
    const idle = tabBar.getByRole("link", { name: "AI" });

    const backgrounds = await Promise.all(
      [active, idle].map((link) =>
        link.evaluate((element) => getComputedStyle(element).backgroundColor),
      ),
    );
    // 选中格有实心底色，未选中格没有——这是设计稿里最显眼的一处状态差
    expect(backgrounds[0]).not.toBe("rgba(0, 0, 0, 0)");
    expect(backgrounds[1]).toBe("rgba(0, 0, 0, 0)");
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
    // 助手创建后会直接落在这个知识库的笔记页；已存在时它停在列表页，所以这里再点一次
    await ensureMobileKnowledgeBase(page);
    if (!/\/m\/notes\/\d+$/.test(page.url())) {
      await page
        .getByRole("link", { name: new RegExp(BASE_NAME) })
        .first()
        .click();
    }
    await expect(page).toHaveURL(/\/m\/notes\/\d+$/, { timeout: 30_000 });

    await page.getByTestId("mobile-note-create").click();
    await expect(page).toHaveURL(/\/m\/notes\/new\?baseId=\d+/, { timeout: 30_000 });

    const title = `移动端笔记 ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("标题").fill(title);
    await page.getByRole("button", { name: "创建笔记" }).click();

    await expect(page).toHaveURL(/\/m\/notes\/\d+\/\d+/, { timeout: 30_000 });
    // 标题就是正文的首节点 H1（没有独立的标题输入行）
    await expect(page.locator(`${EDITOR_SURFACE} h1`).first()).toHaveText(title, {
      timeout: 30_000,
    });
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

  /**
   * 知识库详情页的版式（设计稿 p08）：库头只有**一行**「类型 · 篇数」，
   * 笔记是**分隔线隔开的行列表**而不是卡片堆——卡片会把每行的上下留白叠起来，
   * 一屏少看两条。
   *
   * 这里再补一篇是为了凑够两行——分隔线要有两行才验得出来。
   *
   * 注：2026-09-16 之前本注释写着"列表走 `selectNoteList`，只有写过正文的笔记
   * 才会出现，是既有后端缺陷"。**该归因已被推翻**：那是前端选错了列表端点，
   * 修好后新建即可见（见 `docs/changelist/2026-09-16-note-list-endpoint.md`）。
   * 补的这篇仍写正文，只是为了让列表里有真实可读的内容。
   */
  test("知识库详情：单行库头 + 行列表（不是卡片堆）", async ({ page }) => {
    expect(noteUrl, "上一条用例未能创建笔记").not.toBe("");
    const baseUrl = noteUrl.replace(/\/\d+$/, "");

    // 补第二篇：凑够两行才验得出分隔线（写正文是为了下面断言内容可读）
    await page.goto(baseUrl);
    await page.getByTestId("mobile-note-create").click();
    await expect(page).toHaveURL(/\/m\/notes\/new\?baseId=\d+/, { timeout: 30_000 });
    await page.getByLabel("标题").fill(`移动端第二篇 ${Date.now().toString().slice(-6)}`);
    await page.getByRole("button", { name: "创建笔记" }).click();
    await expect(page).toHaveURL(/\/m\/notes\/\d+\/\d+/, { timeout: 30_000 });

    const surface = page.locator(EDITOR_SURFACE);
    await expect(surface).toBeVisible({ timeout: 30_000 });
    await surface.click();
    await page.keyboard.type("第二篇正文");
    await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(baseUrl);
    const header = page.getByTestId("mobile-base-header");
    await expect(header).toBeVisible({ timeout: 30_000 });
    // 单行：类型与篇数在同一行，没有第二行简介
    await expect(header).toContainText("篇笔记", { timeout: 30_000 });
    const headerBox = await header.boundingBox();
    expect(headerBox?.height ?? 0).toBeLessThan(72);

    const items = page.getByTestId("mobile-note-items");
    await expect(items).toBeVisible({ timeout: 30_000 });
    const rows = items.getByRole("link");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    await expect(rows).toHaveCount(2, { timeout: 30_000 });

    // 行高明显小于卡片：卡片最少 80px（含内边距与卡片间距）
    const box = await rows.first().boundingBox();
    expect(box?.height ?? 0).toBeLessThan(80);

    // 行与行之间是 1px 分隔线（不是卡片间距）：按**算出来的**边框宽度判断，
    // 而不是类名字符串——`last:border-b-0` 本身就含 "border-b" 子串，数类名会数错
    const borders = await items.locator("li").evaluateAll((nodes) =>
      nodes.map((node) => ({
        bottom: getComputedStyle(node).borderBottomWidth,
        radius: getComputedStyle(node).borderRadius,
        shadow: getComputedStyle(node).boxShadow,
      })),
    );
    expect(borders.length).toBe(2);
    for (const [index, style] of borders.entries()) {
      // 非最后一行有分隔线；最后一行没有（否则列表底部会多出一条线）
      expect(style.bottom, `第 ${index + 1} 行的下边框`).toBe(
        index === borders.length - 1 ? "0px" : "1px",
      );
      // 行本身不是卡片：没有圆角、没有阴影
      expect(style.radius).toBe("0px");
      expect(style.shadow).toBe("none");
    }

    await expectNoHorizontalScroll(page);
  });

  test("工具条单行横滑、按钮 ≥40px、更多弹层可开", async ({ page }) => {
    expect(noteUrl, "上一条用例未能创建笔记").not.toBe("");
    await page.goto(noteUrl);
    await expect(page.locator(EDITOR_SURFACE)).toBeVisible({ timeout: 30_000 });

    const toolbar = page.getByRole("toolbar", { name: "编辑器工具栏" });
    await expect(toolbar).toHaveAttribute("data-variant", "mobile");

    /*
     * 不换行 + 横向可滚的容器（工具条自己滚，但不把页面顶出横向滚动条）。
     *
     * **不再断言 `scrollWidth > clientWidth`**：那条断言在常驻 10 个命令时成立，
     * 但 M-09 画板的命令集是 8 个（`B I H2 •列表 1.列表 ☑列表 🔗 🖼 ⋯`）——
     * 收到 8 个之后 9 个按钮在 390 宽下**正好放得下**，`scrollWidth === clientWidth`。
     * 「内容装得下所以不滚」是更好的结果，不该判失败。
     *
     * 真正要守的是 H-8 那条：**画板末位的「⋯」不能被挤出右缘**。下面按几何逐个
     * 按钮核对右边界，等价于"每个按钮都真的在可视区内"，比看 scrollWidth 更直接。
     */
    const metrics = await toolbar.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll("button")];
      return {
        wrap: getComputedStyle(element).flexWrap,
        overflowX: getComputedStyle(element).overflowX,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        buttonCount: buttons.length,
        // 每个按钮右边界相对工具条左边界的位置
        rights: buttons.map((button) => button.getBoundingClientRect().right - box.left),
      };
    });
    expect(metrics.wrap).toBe("nowrap");
    expect(metrics.overflowX).toBe("auto");
    for (const right of metrics.rights) {
      expect(right).toBeLessThanOrEqual(metrics.clientWidth + 1);
    }
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
  test("搜索页替代 ⌘K，可过滤并跳转到知识库", async ({ page }) => {
    await page.goto("/m/search");
    await expect(page.getByTestId("mobile-search")).toBeVisible({ timeout: 30_000 });

    /*
     * 占位文案按 M-10 图例 3 扩成「搜索页面、知识库或操作…」（多了知识库一组）。
     * 命中的目标也从「任务」换成「知识库」：2026-09-15 已拍板任务与慕课不再作为
     * 独立入口（只在各自知识库的 Tab 里出现），所以搜索里不该再有 /m/tasks 候选——
     * 这一点由 `mobile-supplement.spec.ts` 的 M-10 用例专门断言。
     */
    /*
     * 搜索「知识库」会命中两类候选：**页面**组里的「知识库」（/m/notes）
     * 与**知识库**组里按名称列出的每个库（/m/notes/{id}）。点第一项落到哪一边
     * 取决于分组顺序与查询缓存，所以断言放宽到 `/m/notes` 前缀——
     * 这条用例要证明的是"搜索能过滤并跳到知识库"，不是具体命中哪一条。
     */
    await page.getByLabel("搜索页面、知识库或操作").fill("知识库");
    await page
      .getByRole("link", { name: /知识库/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/m\/notes(\/\d+)?$/, { timeout: 30_000 });
  });
});
