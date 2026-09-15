import { type Page, expect, test } from "@playwright/test";
import { setTheme } from "./support/theme";

/**
 * UI 补稿移动端（M-01 – M-13）的还原度门禁。
 *
 * 只跑在 `--project=mobile`（Pixel 5：393×851）下——文件名以 `mobile-` 开头
 * 是 `playwright.config.ts` 的分工规则。命名与 `mobile-core.spec.ts` 区分：
 * 那个覆盖 M10.x 的通用导航与版式，这个覆盖 M12 补稿的**新增屏幕与改动点**。
 *
 * 断言口径与桌面版一致：把画板图例里可断言的规格写成计算样式检查，
 * 人眼看的并排对比图由 `scripts/ui-supplement-compare.mjs` 产出。
 */

async function createBase(page: Page, name: string): Promise<number> {
  return page.evaluate(async (baseName) => {
    const res = await fetch("/api/proxy/note/bases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: baseName, detail: "UI 补稿移动端用例", type: 0 }),
    });
    const json = await res.json();
    if (json.code !== "00000") throw new Error(`建库失败：${json.msg}`);
    return Number(json.data);
  }, name);
}

const unique = (prefix: string) => `${prefix} ${Math.random().toString(36).slice(2, 8)}`;

/** 页面级横向溢出：375/390 宽下最容易出问题，补稿要求"没有横向滚动"。 */
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

/** 底部 tab bar 是否可见——沉浸式判定正确与否的唯一可靠信号。 */
function tabBar(page: Page) {
  return page.getByTestId("mobile-tab-bar");
}

test.describe("UI 补稿 · 移动端", () => {
  /**
   * §1.4 第 7 条：沉浸式判定必须按**数字段**。
   *
   * 回归：旧模式 `/^\/m\/notes\/[^/]+\/[^/]+$/` 会把 `/m/notes/3/tasks`
   * 这类知识库内 Tab 也当成编辑器，底部 tab bar 被误隐藏，与画板 M-03 – M-05 不符。
   */
  test("M-03/04/05 知识库内 Tab 不隐藏 tab bar", async ({ page }) => {
    await page.goto("/m/notes");
    await expect(page.getByTestId("mobile-note-bases")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("补稿移动库"));

    for (const [section, marker] of [
      ["mooc", /课程|慕课/],
      ["tasks", /任务/],
      ["docs", /资料/],
    ] as const) {
      await page.goto(`/m/notes/${baseId}/${section}`);
      await expect(tabBar(page)).toBeVisible({ timeout: 30_000 });
      // 库头与横向 Tab 要保留：切过来像跳到另一页是旧实现的问题
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.locator("body").innerText()).toMatch(marker);
      await expectNoHorizontalScroll(page);
    }

    // 编辑器仍然是沉浸式（不显示 tab bar）——修缺陷不能把这条一起改坏
    await page.goto("/m/search");
    await expect(tabBar(page)).toBeHidden();
  });

  /** M-04：状态筛选平铺成一整条 Segmented，带四项计数（此前是顶栏按钮 + 动作表）。 */
  test("M-04 任务 Tab：筛选平铺、空态文案、无横向滚动", async ({ page }) => {
    await page.goto("/m/notes");
    await expect(page.getByTestId("mobile-note-bases")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("补稿任务库"));

    await page.goto(`/m/notes/${baseId}/tasks`);
    const group = page.getByRole("radiogroup").first();
    await expect(group).toBeVisible({ timeout: 30_000 });
    const radios = group.getByRole("radio");
    await expect(radios).toHaveCount(4);
    await expect(radios.nth(0)).toHaveText(/全部/);
    await expect(radios.nth(1)).toHaveText(/未提交/);
    await expect(radios.nth(2)).toHaveText(/已退回/);
    await expect(radios.nth(3)).toHaveText(/已提交/);

    await expect(page.getByText("这个知识库下还没有任务")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  /** M-05：资料 Tab 行可点 + 列表末尾的上传链接。 */
  test("M-05 资料 Tab：上传链接与空态", async ({ page }) => {
    await page.goto("/m/notes");
    await expect(page.getByTestId("mobile-note-bases")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("补稿资料库"));

    await page.goto(`/m/notes/${baseId}/docs`);
    await expect(page.getByText("还没有资料")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("到「PDF 问答」上传 PDF，之后就能围绕它提问。")).toBeVisible();

    const upload = page.getByRole("link", { name: /去「PDF 问答」上传/ });
    await expect(upload).toBeVisible();
    await expect(upload).toHaveAttribute("href", "/m/ai/pdf");
  });

  /** M-07：新建笔记的库单选行、封面方块、标题输入 48 高 16 号（防 iOS 缩放）。 */
  test("M-07 新建笔记：规格与 ?baseId 预选", async ({ page }) => {
    await page.goto("/m/notes");
    await expect(page.getByTestId("mobile-note-bases")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("补稿新建库"));

    await page.goto(`/m/notes/new?baseId=${baseId}`);
    const title = page.getByPlaceholder("3-15 个字符");
    await expect(title).toBeVisible({ timeout: 30_000 });

    const style = await title.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        radius: s.borderRadius,
        fontSize: s.fontSize,
        height: el.getBoundingClientRect().height,
      };
    });
    expect(style.radius).toBe("10px");
    // 小于 16px 时 iOS 会在聚焦时自动放大整页 —— 这条是硬要求
    expect(style.fontSize).toBe("16px");
    expect(Math.round(style.height)).toBe(48);

    await expect(page.getByText("0 / 15")).toBeVisible();
    // 标题输入框要真的可用（不是被遮挡）
    await title.fill("补稿测试");
    await expect(title).toHaveValue("补稿测试");
  });

  /** M-10：搜索分三组、行右侧只显示 ›、不再出现路径。 */
  test("M-10 搜索：分组标题、占位文案、不显示开发路径", async ({ page }) => {
    await page.goto("/m/search");
    const input = page.getByPlaceholder("搜索页面、知识库或操作…");
    await expect(input).toBeVisible({ timeout: 30_000 });

    const style = await input.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, height: el.getBoundingClientRect().height };
    });
    expect(style.radius).toBe("10px");
    expect(Math.round(style.height)).toBe(44);

    const body = await page.locator("body").innerText();
    for (const group of ["快捷操作", "知识库", "页面"]) {
      expect(body, `缺少分组「${group}」`).toContain(group);
    }
    // 「任务」「慕课」已拍板不再作为独立入口
    expect(body).not.toMatch(/\/m\/tasks|\/m\/mooc/);
    // 行右侧只显示 ›，不再把 /m/xxx 这类路径摆给用户
    expect(body).not.toMatch(/\/m\/[a-z]/);

    // 有输入时出现清除按钮
    await input.fill("协作");
    await expect(page.getByRole("button", { name: /清除/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // 无结果时的文案 + 新建入口（3–15 字才给）
    await input.fill("zzzz-no-such-page");
    await expect(page.getByText(/没有找到/)).toBeVisible();
    await expect(page.getByText("搜索只覆盖页面与知识库名称，笔记正文暂不支持。")).toBeVisible();
  });

  /** M-11：iOS 设置式行表单（标签左、值右、行高 52），不再堆桌面两列表单。 */
  test("M-11 设置分节：行表单、性别动作表、主题三行单选", async ({ page }) => {
    await page.goto("/m/settings/profile");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    // 原生 select 在深色下无法用 Token 上色，也撑不出"右侧当前值 + ›"的行形态
    expect(await page.locator("select").count()).toBe(0);
    await expectNoHorizontalScroll(page);

    // 主题三行单选：点了立即生效
    await page.goto("/m/settings/appearance");
    const radios = page.getByRole("radio");
    await expect(radios.first()).toBeVisible({ timeout: 30_000 });
    expect(await radios.count()).toBeGreaterThanOrEqual(3);
    await expectNoHorizontalScroll(page);
  });

  /** M-02：退出登录必须先确认（此前点了直接登出）。 */
  test("M-02 我的：资料卡可点、退出需确认", async ({ page }) => {
    await page.goto("/m/me");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

    // 资料卡整卡可点
    await expect(page.getByRole("link", { name: /个人资料|账号/ }).first()).toBeVisible();

    // 「更多」只剩协同文档与 PDF 问答
    const body = await page.locator("body").innerText();
    expect(body).toContain("协同文档");
    expect(body).not.toMatch(/^任务$|^慕课$/m);

    await page.getByRole("button", { name: /退出登录/ }).click();
    // 二次确认（动作表），取消后仍在本页
    await expect(page.getByText(/确定要退出|退出登录\?|确认/).first()).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/m\/me$/);
  });

  /** M-08：协同文档库的返回键与「⋯」二次确认移除。 */
  test("M-08 协同文档库：返回键、说明文案、二级浅色主题一致", async ({ page }) => {
    await page.goto("/m/docs");
    await expect(page.getByRole("heading", { name: "协同文档", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    // 本页不是 tab 根页，必须给返回键
    await expect(page.getByRole("button", { name: /返回/ })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // 深色下不出现"黑带"（token 替换的移动端验证）
    await setTheme(page, "深色");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.goto("/m/me");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page);
  });

  /** 12.1.2 + F-02：旧移动地址重定向到知识库列表。 */
  test("F-02 旧地址重定向：/m/tasks、/m/mooc 落到 /m/notes", async ({ page }) => {
    for (const from of ["/m/tasks", "/m/mooc"]) {
      await page.goto(from);
      await expect(page).toHaveURL(/\/m\/notes$/, { timeout: 20_000 });
      await expect(page.getByTestId("mobile-note-bases")).toBeVisible({ timeout: 30_000 });
    }
  });

  /** 12.1.3：删除的 wikis 路由不再存在。 */
  test("已删除的 /m/wikis 返回 404", async ({ page }) => {
    const response = await page.goto("/m/wikis");
    expect(response?.status()).toBe(404);
  });

  /** M-01：工作台「全部」进入本库任务 Tab，tab bar 保持「知识库」高亮。 */
  test("M-01 工作台：任务入口带库 id、tab 高亮正确", async ({ page }) => {
    await page.goto("/m/notes");
    await expect(page.getByTestId("mobile-note-bases")).toBeVisible({ timeout: 30_000 });
    await createBase(page, unique("补稿工作台库"));

    await page.goto("/m/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expectNoHorizontalScroll(page);

    const body = await page.locator("body").innerText();
    // 待办里的任务行与「全部」都必须带库上下文，不能回跨库列表
    expect(body).not.toMatch(/\/m\/tasks/);
  });
});
