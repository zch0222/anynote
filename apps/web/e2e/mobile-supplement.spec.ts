import { type Page, expect, test } from "@playwright/test";

/**
 * UI 补稿移动端（M-01 – M-13）的还原度门禁。
 *
 * 只跑在 `--project=mobile`（Pixel 5：393×851）下——文件名以 `mobile-` 开头
 * 是 `playwright.config.ts` 的分工规则。命名与 `mobile-core.spec.ts` 区分：
 * 那个覆盖 M10.x 的通用导航与版式，这个覆盖 M12 补稿的**新增屏幕与改动点**。
 *
 * 其中 **M-08（协同文档库）整块退役**：`/m/docs` 已删除（M13.5，方案 §7.6 / §8），
 * 协同改为「笔记的一种编辑模式」，移动端入口就是笔记编辑器本身，其用例随之整体删除。
 * 对应画板只存在于设计存档里，`reference/supplement/m08-doc-library*.png` 仍留档备查。
 *
 * 断言口径与桌面版一致：把画板图例里可断言的规格写成计算样式检查，
 * 人眼看的并排对比图由 `scripts/ui-supplement-compare.mjs` 产出。
 */

async function createBase(page: Page, name: string): Promise<number> {
  return page.evaluate(async (baseName) => {
    const res = await fetch("/api/proxy/note/bases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // cover 是后端必填（缺了返回「知识库封面不能为空」），与前端默认值同址
      body: JSON.stringify({
        name: baseName,
        detail: "UI 补稿移动端用例",
        cover: "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png",
        type: 0,
      }),
    });
    const json = await res.json();
    if (json.code !== "00000") throw new Error(`建库失败：${json.msg}`);
    // 响应体是 CreateKnowledgeBaseVO（`{ id }`），不是裸数字——
    // `Number(json.data)` 会得到 NaN，后续拼出来的地址全是 `/notes/NaN/...`
    return Number(json.data?.id ?? json.data);
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
    // 空态的说明文案来自 Q-02 总表（M-05 行）
    await expect(page.getByText("到「PDF 问答」上传 PDF，之后就能围绕它提问。")).toBeVisible();

    /*
     * 上传入口在空态下是那个动作按钮、列表非空时是末尾的文字链接，
     * 两处共用 `data-testid="mobile-doc-upload-link"`，也都指向 /m/ai/pdf
     *（「上传只保留 PDF 问答一条链路」）。
     *
     * 用 testid 而不是 `getByRole("link", …)`：Base UI 的 `Button` 无论
     * `nativeButton` 取值都会给 `render` 出来的 `<a>` 盖上 `role="button"`，
     * 按 link 角色找不到它（这是组件库行为，不是产品缺陷）。
     */
    const upload = page.getByTestId("mobile-doc-upload-link").first();
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

    /*
     * 「更多」只剩 PDF 问答：任务、慕课已按 2026-09-15 拍板移除（两者只属于知识库，
     * 从「我的」进去会看不到"在哪个库"），协同文档随 `/docs` 退役（M13.5）。
     * 来源是 `navigation.ts` 的 `mobileMoreRoutes`（当前只有一条）。
     *
     * 只断言「更多」这一组内的链接，而不是整页 body 文本：
     * 页面下方还有「仅桌面版」组，那里的 AI 工作流文案也提到"桌面版"，用整页文本
     * 判断会把两组混在一起。
     *
     * 定位用 section + 组标题而不是 `getByRole("navigation")`：
     * `mobile-me.tsx` 里这些分组是 `<section>` 包一个 `<h2>`，不是 landmark。
     */
    const more = page
      .getByTestId("mobile-me")
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "更多", exact: true }) });
    await expect(more.getByRole("link", { name: /PDF 问答/ })).toBeVisible();
    await expect(more.getByRole("link", { name: /协同文档/ })).toHaveCount(0);
    await expect(more.getByRole("link", { name: /^任务/ })).toHaveCount(0);
    await expect(more.getByRole("link", { name: /^慕课/ })).toHaveCount(0);

    await page.getByRole("button", { name: /退出登录/ }).click();
    /*
     * 二次确认走 MobileActionSheet，标题固定是「退出登录？」。
     * 断言用标题本身而不是 /确认/ 这类泛词：后者会命中页面上的其它文字。
     */
    await expect(page.getByText("退出登录？")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("退出后需要重新输入账号密码，未保存的内容会丢失。")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/m\/me$/);
  });

  /*
   * M-08（协同文档库）整块退役：`/m/docs` 路由已删除（方案 §7.6 / §8），
   * 协同改为笔记的一种编辑模式，移动端入口就是笔记编辑器本身。
   * 「返回键 + 行元信息」这条前提随之消失，用例整体删除而不是改成空跑——
   * 对应的 `m08-doc-library*` 参考图仍留档在 `reference/supplement/` 下备查。
   */

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

  /**
   * 深色下的填充 Token 复查（Q-01 #1–#3 的移动端口径）。
   *
   * 单独立一条而不是塞进路由用例：主题是会跨用例残留的全局状态，
   * 混在路由用例里会让后者随时因为"上一轮留了深色"而失败。
   * （原文写的是"M-08"，那条协同文档库用例已随 `/docs` 退役删除。）
   */
  test("深色下移动端各页不横向溢出，且填充 Token 生效", async ({ page }) => {
    await page.goto("/m/settings/appearance");
    // 按可访问名点，不按序号：页面上还有性别等其它单选行，序号会漂
    const darkRadio = page.getByRole("radio", { name: "深色" });
    await expect(darkRadio).toBeVisible({ timeout: 30_000 });
    await darkRadio.click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    /*
     * 判定"填充 Token 在深色下不是黑"要看**算出来的颜色**，不是变量字面量：
     * 同一个语义值可能写成 `rgb(255 255 255 / 0.07)`，也可能被浏览器序列化成
     * `#ffffff12`（本轮实测就是后者）。所以把变量塞进一个临时元素的
     * `background-color` 上让浏览器归一化，再断言它的通道值。
     */
    const fills = await page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const read = (name: string) => {
        probe.style.backgroundColor = `var(${name})`;
        return getComputedStyle(probe).backgroundColor;
      };
      const value = { hover: read("--fill-hover"), track: read("--segmented-track") };
      probe.remove();
      return value;
    });
    /** 归一化后的颜色 → [r,g,b,a]；`rgb(...)` 与 `rgba(...)` 都吃。 */
    const channels = (color: string) => color.match(/[\d.]+/g)?.map(Number) ?? [];

    for (const [name, color] of Object.entries(fills)) {
      const [r, g, b, alpha] = channels(color);
      // 亮色三通道 + 低透明度 = 深色下的"白色叠加"；纯黑会是 0,0,0
      expect(r, `${name} 应偏亮（深色填充是白色叠加），实际 ${color}`).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(200);
      expect(b).toBeGreaterThan(200);
      expect(alpha ?? 1).toBeLessThan(0.5);
    }

    /*
     * `/m/docs` 已随 `/docs` 退役（M13.5），从这一组里移除——它的「深色不溢出」
     * 前提随之消失。留 `/m/me` 与 `/m/notes` 两条覆盖分组列表与卡片网格两种版式。
     */
    for (const path of ["/m/me", "/m/notes"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
      await expectNoHorizontalScroll(page);
    }

    // 复位成浅色，避免主题状态泄漏到后续用例
    await page.goto("/m/settings/appearance");
    await page.getByRole("radio", { name: "浅色" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });
});
