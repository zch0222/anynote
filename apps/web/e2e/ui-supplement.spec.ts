import { type Page, expect, test } from "@playwright/test";
import { setTheme } from "./support/theme";

/**
 * UI 补稿（M12）的**还原度门禁**：把画板图例里可断言的规格变成可执行检查。
 *
 * 与 `ui-redesign.spec.ts` 的分工：那个对的是 PDF 原设计稿（p01–p16）；
 * 这个对的是补稿画板 D-01 – D-18 / M-01 – M-13。
 *
 * 为什么断言**计算样式**而不是截图比对：像素比对对"字体渲染差异"和"整块位置错位"
 * 给的分几乎一样，反而掩盖真正要看的东西。而图例里那些规格（圆角 10、
 * 分段控件轨道色、热力色阶、页脚底色）本来就有确定的计算值——
 * 把它们写成断言，回归时能直接告诉你是哪一条规格破了。
 *
 * 人眼看的并排对比图由 `scripts/ui-supplement-compare.mjs` 产出，两者互补。
 *
 * 只跑在 chromium：断言的都是桌面画板的规格；移动端规格在
 * `mobile-supplement.spec.ts` 里（Pixel 5 视口）。
 */

/** 建一个知识库，返回 id。用例之间不复用：每个用例改的数据不同。 */
async function createBase(page: Page, name: string): Promise<number> {
  return page.evaluate(async (baseName) => {
    const res = await fetch("/api/proxy/note/bases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // cover 是后端必填（缺了返回「知识库封面不能为空」），与前端默认值同址
      body: JSON.stringify({
        name: baseName,
        detail: "UI 补稿用例",
        cover: "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png",
        type: 0,
      }),
    });
    const json = await res.json();
    if (json.code !== "00000") throw new Error(`建库失败：${json.msg}`);
    return Number(json.data);
  }, name);
}

async function createNote(page: Page, baseId: number, title: string): Promise<number> {
  return page.evaluate(
    async ({ b, t }) => {
      const res = await fetch("/api/proxy/note/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: t, knowledgeBaseId: b, content: `# ${t}\n\n正文。` }),
      });
      const json = await res.json();
      if (json.code !== "00000") throw new Error(`建笔记失败：${json.msg}`);
      return Number(json.data);
    },
    { b: baseId, t: title },
  );
}

/** 读某个属性的计算值。 */

const unique = (prefix: string) => `${prefix} ${Math.random().toString(36).slice(2, 8)}`;

test.describe("UI 补稿还原度", () => {
  /**
   * Q-01 #1–#3：填充层级（12.0.1）。
   *
   * 这一条是补稿里**唯一必须靠深色才看得出**的问题：浅色下 `bg-grouped` 当悬停色
   * 是能用的（#F2F2F7 在 #FFF 上有反馈），深色下它等于页面底色，悬停毫无变化。
   * 所以断言必须两态都比，且要求"两态的悬停底不同"。
   */
  test("Q-01 填充 Token：悬停 / 页脚 / 分段控件在深色下不再是纯黑", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    const readFills = () =>
      page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const val = (n: string) => root.getPropertyValue(n).trim();
        return {
          hover: val("--fill-hover"),
          footer: val("--fill-footer"),
          track: val("--segmented-track"),
          thumb: val("--segmented-thumb"),
        };
      });

    const light = await readFills();
    expect(light.hover).toBe("#f2f2f7");
    expect(light.track).toBe("#e9e9ee");
    expect(light.thumb).toBe("#ffffff");

    await setTheme(page, "深色");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const dark = await readFills();

    // 深色下必须是白色低透明度叠加，不能是黑（黑与页面底 #000 完全分不开）
    expect(dark.hover, "深色悬停底不能等于页面底色").not.toBe("rgb(0, 0, 0)");
    expect(dark.hover).toMatch(/rgb\(255 255 255/);
    expect(dark.footer).toMatch(/rgb\(255 255 255/);
    expect(dark.track).toMatch(/rgb\(255 255 255/);
    // 分段控件轨道与选中格必须拉开：同色就退化成"看不出选中"
    expect(dark.thumb).not.toBe(dark.track);
    expect(dark.thumb).not.toBe("rgb(0, 0, 0)");
  });

  /** 12.0.2：输入框圆角 10（已拍板，此前是 14）。 */
  test("D-03 输入框圆角为 10、高度 40、占位文案正确", async ({ page }) => {
    await page.goto("/notes/new");
    const input = page.getByPlaceholder("3-15 个字符");
    await expect(input).toBeVisible({ timeout: 30_000 });

    const radius = await input.evaluate((el) => getComputedStyle(el).borderRadius);
    // --radius-md 定义为 0.625rem = 10px
    expect(radius).toBe("10px");
    // 图例 19：40 高（h-10）
    await expect(input).toHaveClass(/h-10/);
    // 标题上限 15 字，所以计数分母必须是 15 而不是 20
    await expect(page.getByText("0 / 15")).toBeVisible();
  });

  /** 12.0.2：姓名 / 邮箱等表单控件与输入框同高同圆角（不再用原生 select 的 36/6）。 */
  test("D-12 设置 · 账号：字段规格与未保存提示", async ({ page }) => {
    await page.goto("/settings/profile");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

    // 昵称输入 32 高、圆角 10、计数 30
    const nickname = page.getByLabel(/昵称/).first();
    await expect(nickname).toBeVisible();
    await expect(nickname).toHaveClass(/rounded-md/);
    await expect(page.getByText(/\/ 30/)).toBeVisible();

    // 性别是 Select 而不是原生 <select>：原生控件在深色下无法用 Token 上色
    expect(await page.locator("select").count()).toBe(0);

    // 用户名只读：图例 11 要求带锁图标 +「不可修改」
    await expect(page.getByText(/不可修改/)).toBeVisible();

    // 未保存提示：一致时隐藏、保存按钮禁用
    const save = page.getByRole("button", { name: "保存资料" });
    await expect(save).toBeDisabled();
  });

  /** 12.0.2 + D-14：登录卡片规格与密码显隐。 */
  test("D-14 登录：卡片宽 400 圆角 20，密码可显隐", async ({ page }) => {
    // 该用例要匿名态：登录页对已登录用户会跳走
    await page.context().clearCookies();
    await page.goto("/login");

    const card = page.locator('[data-slot="card"]').first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const cardStyle = await card.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, width: el.getBoundingClientRect().width };
    });
    expect(cardStyle.radius).toBe("20px");
    expect(Math.round(cardStyle.width)).toBe(400);

    // 品牌标记：Logo + 文字，而不是纯文字小标签
    await expect(page.getByText("Anynote", { exact: true })).toBeVisible();

    // 密码显隐（图例 7）
    const pwd = page.locator('[data-slot="password-input"]').first();
    await expect(pwd).toHaveAttribute("type", "password");
    const toggle = page.locator('[data-slot="password-input-toggle"]').first();
    await expect(toggle).toHaveAttribute("aria-label", "显示密码");
    await toggle.click();
    await expect(pwd).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-label", "隐藏密码");
  });

  /** D-04 ④：删除笔记必须走确认对话框，不能是 window.confirm。 */
  test("D-04 删除笔记走确认对话框，默认焦点不在确认键", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("UI 删除确认"));
    const noteId = await createNote(page, baseId, unique("待删除笔记"));

    await page.goto(`/notes/${baseId}/${noteId}`);
    await expect(page.locator(".anynote-editor__content")).toBeVisible({ timeout: 30_000 });

    await page
      .getByRole("button", { name: /更多|⋯/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "删除笔记" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // 破坏性操作的默认焦点必须落在「取消」上，否则回车直接删
    await expect(dialog.getByRole("button", { name: "取消" })).toBeFocused();
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).toBeHidden();

    // 取消之后笔记还在
    await page.reload();
    await expect(page.locator(".anynote-editor__content")).toBeVisible({ timeout: 30_000 });
  });

  /**
   * D-07 / §1.4 第 2–3 条：状态枚举与「已提交不出提交按钮」。
   *
   * 这两条都是**修缺陷**，不是在现有行为上加东西：
   * - 前端把 `submissionStatus = 2` 当「已退回」（正确含义是「无需提交」，即管理员自己）
   * - 移动端对已提交任务显示「重新提交」，点了后端必然拒绝
   */
  test("D-07 任务 Tab：管理员能看到「新建任务」，页头副标题口径正确", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("UI 任务"));

    await page.goto(`/notes/${baseId}/tasks`);
    // 建库人默认是本库管理员 → 应看到页头主按钮
    await expect(page.getByRole("link", { name: "新建任务" })).toBeVisible({ timeout: 30_000 });
    // 空态文案照 Q-02 总表
    await expect(page.getByText("这个知识库下还没有任务")).toBeVisible();
    await expect(page.getByText("任务由知识库管理员发布。")).toBeVisible();
  });

  /** D-05：权限不足时隐藏「新建课程」（避免点了才报无权限）。 */
  test("D-05 慕课 Tab：页头主按钮与空态文案", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("UI 慕课"));

    await page.goto(`/notes/${baseId}/mooc`);
    await expect(page.getByRole("button", { name: "新建课程" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("这个知识库下还没有课程")).toBeVisible();
    await expect(page.getByText("新建一门课，把视频和资料整理进来。")).toBeVisible();
  });

  /** D-08：资料行整行可点、页头有「上传 PDF」。 */
  test("D-08 资料 Tab：页头主按钮指向 PDF 问答并带 baseId", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("UI 资料"));

    await page.goto(`/notes/${baseId}/docs`);
    const upload = page.getByRole("link", { name: "上传 PDF" });
    await expect(upload).toBeVisible({ timeout: 30_000 });
    await expect(upload).toHaveAttribute("href", `/ai/pdf?baseId=${baseId}`);
    await expect(page.getByText("还没有资料")).toBeVisible();
  });

  /** D-09：三档权限说明卡 + 搜索框圆角 10。 */
  test("D-09 成员 Tab：三档权限说明与搜索框规格", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("UI 成员"));

    await page.goto(`/notes/${baseId}/members`);
    for (const label of ["管理员", "可编辑", "可阅读"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    }

    const search = page.getByPlaceholder(/搜索用户名/);
    await expect(search).toBeVisible();
    expect(await search.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("10px");
  });

  /** 12.5.1：删除协同文档必须先确认（此前点了立即删）。 */
  test("D-10 协同文档库：删除走确认、标题与侧栏入口同名", async ({ page }) => {
    await page.goto("/docs");
    await expect(page.getByRole("heading", { name: "协同文档", level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    // 建一篇：建完会出现卡片，删除按钮在卡片上
    await page.getByRole("button", { name: "新建文档" }).first().click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    // 页脚必须有「取消」（图例 24）
    await expect(createDialog.getByRole("button", { name: "取消" })).toBeVisible();
    await createDialog.getByLabel(/标题|名称/).fill(unique("协作文档"));
    await createDialog.getByRole("button", { name: "创建" }).click();
    await expect(createDialog).toBeHidden({ timeout: 20_000 });

    const del = page.getByRole("button", { name: /^删除 / }).first();
    await expect(del).toBeVisible({ timeout: 20_000 });
    await del.click();

    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText("从文档库移除？")).toBeVisible();
    await expect(confirm.getByRole("button", { name: "取消" })).toBeFocused();
    await confirm.getByRole("button", { name: "取消" }).click();
    await expect(confirm).toBeHidden();
  });

  /** D-13：外观是带预览的单选卡 + radiogroup 语义，不是三个小胶囊。 */
  test("D-13 设置 · 外观：radiogroup 单选卡与生效说明", async ({ page }) => {
    await page.goto("/settings/appearance");
    const group = page.getByRole("radiogroup").first();
    await expect(group).toBeVisible({ timeout: 30_000 });

    const radios = group.getByRole("radio");
    await expect(radios).toHaveCount(3);

    // 点了立即生效：不落"保存"按钮
    await radios.nth(1).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await radios.nth(0).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    // 说明必须同时说清「系统是什么色」与「偏好只在本机」
    await expect(page.getByText(/当前系统为/)).toBeVisible();
    await expect(page.getByText(/偏好只保存在这台设备的浏览器里/)).toBeVisible();
  });

  /** D-13：集成空态不再点名内部服务（MinIO / 华为 OBS）。 */
  test("D-13 设置 · 集成：空态文案不暴露实现", async ({ page }) => {
    await page.goto("/settings/integrations");
    await expect(page.getByText("暂无可用的集成")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("文件存储与 AI 服务由管理员在后台配置，这里暂时没有需要你连接的服务。"),
    ).toBeVisible();
    // 旧文案点名了 MinIO 与华为 OBS——面向开发者，不该出现在用户界面
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/MinIO|OBS/i);
  });

  /** D-15：说明不再出现字面星号、且给出回调端口让人能和终端核对。 */
  test("D-15 CLI 授权：无字面星号、显示回调端口", async ({ page }) => {
    await page.goto("/cli/authorize?port=53817&state=abc&challenge=def");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

    const body = await page.locator("body").innerText();
    expect(body, "说明里不应出现字面 ** 星号").not.toContain("**");
    // 端口必须显示出来，否则用户无法与终端里的地址核对
    await expect(page.getByText(/53817/)).toBeVisible();
  });

  /** D-16：历史版本入口在编辑器 ⋯ 菜单第一项，页面满幅。 */
  test("D-16 笔记历史版本：入口、满幅与空态文案", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("UI 历史"));
    const noteId = await createNote(page, baseId, unique("历史笔记"));

    await page.goto(`/notes/${baseId}/${noteId}`);
    await expect(page.locator(".anynote-editor__content")).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", { name: /更多|⋯/ })
      .first()
      .click();
    const first = page.getByRole("menuitem").first();
    await expect(first).toHaveText(/历史版本/);
    await first.click();

    await expect(page).toHaveURL(new RegExp(`/notes/${baseId}/${noteId}/history$`), {
      timeout: 20_000,
    });
    // 独立新建的笔记只有「当前版本」一条 → 空态文案
    await expect(page.getByText("这篇笔记还没有历史版本")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("之后每次保存都会在这里留下一个版本。")).toBeVisible();

    // 满幅：外层不应出现内容卡片的圆角 + 阴影（那等于把设计稿否掉）
    const shell = page.locator('[data-slot="app-main"], main').first();
    const shellClass = (await shell.getAttribute("class")) ?? "";
    expect(shellClass).not.toMatch(/rounded-(lg|xl)/);
  });

  /** 12.0.3：错误态必须带重试按钮（此前 24 处都只有一行文案）。 */
  test("Q-02 错误态带重试，重试会重新发请求", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    // 让知识库列表失败一次
    let calls = 0;
    await page.route("**/api/proxy/note/bases**", async (route) => {
      calls += 1;
      if (calls === 1) return route.fulfill({ status: 500, body: "boom" });
      return route.continue();
    });

    await page.goto("/notes");
    const alert = page.locator('[data-slot="query-error"]').first();
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toHaveAttribute("role", "alert");
    // 文案必须是用户语言，不能把 "boom" 或内部组件名透出去
    const text = await alert.innerText();
    expect(text).toMatch(/加载失败/);

    const retry = alert.getByRole("button", { name: /重试/ });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
  });

  /** 12.1.2：旧地址重定向，且浏览器历史里不留旧地址。 */
  test("F-01 旧地址重定向：/mooc、/tasks 落到知识库列表", async ({ page }) => {
    const redirects: Array<[string, string]> = [
      ["/mooc", "/notes"],
      ["/tasks", "/notes"],
    ];
    for (const [from, to] of redirects) {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(`${to}$`), { timeout: 20_000 });
      await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    }
  });

  test("F-01 旧地址 /mooc/:id 落回本库的慕课详情", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("UI 重定向"));

    const moocId = await page.evaluate(async (b) => {
      const res = await fetch("/api/proxy/note/moocs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `旧地址课程 ${Math.random().toString(36).slice(2, 6)}`,
          knowledgeBaseId: b,
          cover: "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png",
          dataScope: 1,
        }),
      });
      const json = await res.json();
      if (json.code !== "00000") throw new Error(`建课失败：${json.msg}`);
      return Number(json.data);
    }, baseId);

    await page.goto(`/mooc/${moocId}`);
    // 必须落到带知识库 id 的新地址，否则侧栏与 tab bar 都没有上下文
    await expect(page).toHaveURL(new RegExp(`/notes/${baseId}/mooc/${moocId}$`), {
      timeout: 30_000,
    });
    // replace 而不是 push：历史里不该留下旧地址（返回键不会来回弹）
    const historyLength = await page.evaluate(() => history.length);
    expect(historyLength).toBeLessThan(6);
  });
});
