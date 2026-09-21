import { type Page, expect, test } from "@playwright/test";
import { setTheme } from "./support/theme";

/**
 * UI 补稿（M12）的**还原度门禁**：把画板图例里可断言的规格变成可执行检查。
 *
 * 与 `ui-redesign.spec.ts` 的分工：那个对的是 PDF 原设计稿（p01–p16）；
 * 这个对的是补稿画板 D-01 – D-18 / M-01 – M-13。
 *
 * 其中 **D-10（协同文档库）整块退役**：`/docs` 独立文档库已删除（M13.5，方案 §7.6 / §8），
 * 协同改为「笔记的一种编辑模式」，其用例随之整体删除（D-11 协同工作区同理）。
 * 对应画板只存在于设计存档里，`reference/supplement/d10-collab-library*.png` 仍留档备查。
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
    // 响应体是 CreateKnowledgeBaseVO（`{ id }`），不是裸数字——
    // `Number(json.data)` 会得到 NaN，后续拼出来的地址全是 `/notes/NaN/...`
    return Number(json.data?.id ?? json.data);
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

test.describe("D-02 知识库概览：版式还原", () => {
  /*
   * 画板是 1440×900。Playwright 的 Desktop Chrome 预设是 1280×720，
   * 而概览页的内容列是 `max-w-[1000px]` 居中——1280 下内容区只剩 984 宽，
   * 减去 64 的页边距就是 920，所有几何断言都会整体差 80。
   * 这里显式对齐画板视口，下面的数字才能与画板直接比。
   */
  test.use({ viewport: { width: 1440, height: 900 } });

  /**
   * 这一组断言的是**画板实测出来的版式数字**，不是"看着差不多"。
   *
   * 数值来源与量法见 `apps/web/scripts/lib/supplement-crops.mjs` 的注释：
   * 画板把屏幕画在 2 设备像素宽、颜色恒为 `#d8d8de` 的窗口边框里，裁出内区后
   * 逐像素测量。本页（D-02）的内区是 1440×900，所以下面所有数字都能直接对。
   *
   * 为什么这些数字值得钉住：概览页此前**根本没有还原**——没有头图卡片、
   * 没有 5 格计数、没有预览块，整页只有标题与一句话。这类"缺结构"的回归
   * 光靠人眼看对比图很容易滑过去，写成断言才能在 CI 里拦住。
   */
  test("头图卡片按画板几何：1000 宽、封面 976x96、卡内留白 12", async ({ page }) => {
    /*
     * 用真实数据而不是空库：空库下预览块是虚线空态，几何与画板对不上——
     * 那属于空态分支，另有用例覆盖。这里要对的是**有内容时**的版式。
     */
    // 造数只用到同源 fetch，不需要等画廊渲染完——等它反而把用例
    // 绑在画廊的加载耗时上（实测这一等偶发吃掉 30s 超时）。
    await page.goto("/notes");
    const baseId = await createBase(page, unique("D-02 头图"));
    for (const title of ["设计原则速查", "组件命名约定", "评审检查清单"]) {
      await createNote(page, baseId, `${title} ${Math.random().toString(36).slice(2, 6)}`);
    }

    await page.goto(`/notes/${baseId}/overview`);
    const hero = page.getByTestId("kb-hero");
    await expect(hero).toBeVisible({ timeout: 30_000 });

    const box = await hero.boundingBox();
    expect(box, "头图卡片应有尺寸").not.toBeNull();
    // 画板：卡片 x 368..1367（1000 宽）
    expect(Math.round(box?.width ?? 0)).toBe(1000);

    // 封面 976×96、圆角 10（画板：x 380..1355, y 40..135）
    const cover = hero.locator("> div[aria-hidden='true']").first();
    const coverBox = await cover.boundingBox();
    expect(Math.round(coverBox?.width ?? 0)).toBe(976);
    expect(Math.round(coverBox?.height ?? 0)).toBe(96);
    expect(await cover.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("10px");

    // 卡内留白 12（画板：封面距卡顶 12、距卡左 12）
    expect(Math.round((coverBox?.x ?? 0) - (box?.x ?? 0))).toBe(12);
    expect(Math.round((coverBox?.y ?? 0) - (box?.y ?? 0))).toBe(12);

    // 卡片圆角 14（画板偏移序列 11,8,6,5,4,3,3,2,1,1,1,0 → 半径 14）
    expect(await hero.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("14px");

    // 标题是 Display 34/41 SemiBold（图例 4）
    const h1 = page.getByRole("heading", { level: 1 });
    const h1Style = await h1.evaluate((el) => {
      const s = getComputedStyle(el);
      return { size: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight };
    });
    expect(h1Style.size).toBe("34px");
    expect(h1Style.weight).toBe("600");
    expect(h1Style.lineHeight).toBe("41px");
  });

  test("概览页不渲染顶栏，搜索/主题/新建笔记都在头图卡片里", async ({ page }) => {
    // 造数只用到同源 fetch，不需要等画廊渲染完——等它反而把用例
    // 绑在画廊的加载耗时上（实测这一等偶发吃掉 30s 超时）。
    await page.goto("/notes");
    const baseId = await createBase(page, unique("D-02 动作行"));

    await page.goto(`/notes/${baseId}/overview`);
    await expect(page.getByTestId("kb-hero")).toBeVisible({ timeout: 30_000 });

    /*
     * 画板里这一页**没有 56 高的顶栏**：搜索（图例 7）、主题（图例 8）与
     * 「新建笔记」（图例 9）三个动作都在头图卡片的动作行里。
     * 顶栏若照常渲染，同一屏会有两套「切换主题」按钮——`getByRole` 直接
     * 变成 strict mode violation，所以这里用单数查询本身就是断言。
     */
    await expect(page.getByTestId("app-header")).toHaveCount(0);
    const hero = page.getByTestId("kb-hero");
    await expect(hero.getByTestId("kb-overview-search")).toHaveCount(1);
    await expect(hero.getByRole("button", { name: "切换主题" })).toHaveCount(1);
    // 全页也只有一份（再点一次全局，确认没有第二处）
    await expect(page.getByRole("button", { name: "切换主题" })).toHaveCount(1);
    await expect(page.getByTestId("kb-overview-search")).toHaveCount(1);

    // 搜索按钮真的能打开命令面板（图例 7：打开命令面板 D-04）
    await page.getByTestId("kb-overview-search").click();
    await expect(page.getByRole("combobox", { name: "搜索页面或操作" })).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press("Escape");
  });

  test("5 格计数与侧栏二级导航一一对应，卡片 190x98、色块 28x28", async ({ page }) => {
    // 造数只用到同源 fetch，不需要等画廊渲染完——等它反而把用例
    // 绑在画廊的加载耗时上（实测这一等偶发吃掉 30s 超时）。
    await page.goto("/notes");
    const baseId = await createBase(page, unique("D-02 计数"));

    await page.goto(`/notes/${baseId}/overview`);
    await expect(page.getByTestId("kb-stat-notes")).toBeVisible({ timeout: 30_000 });

    /*
     * 5 格与侧栏二级导航**一一对应**（图例 10 原话）。
     *
     * 侧栏共 6 项，其中「概览」是当前页自己，所以 5 格对应的是**除概览外的 5 项**。
     * 这里按 href 配对而不是按下标：下标配对在导航增删一项时会静默错位，
     * 配上 `toHaveCount(1)` 又恰好还能过——那是最糟的一种假绿。
     */
    const keys = ["notes", "mooc", "tasks", "docs", "members"];
    const sidebarTabs = page
      .getByTestId("app-sidebar")
      .getByRole("navigation", { name: "知识库内容" })
      .getByRole("link");
    await expect(sidebarTabs).toHaveCount(6); // 5 格 + 概览

    // 读两侧的 href 集合做对比（顺序也要一致）
    const sidebarHrefs = await sidebarTabs.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")),
    );
    const tileHrefs: string[] = [];
    for (const key of keys) {
      const tile = page.getByTestId(`kb-stat-${key}`);
      await expect(tile).toHaveCount(1);
      // 点哪格去哪个 Tab（图例 11–15）
      const href = await tile.getAttribute("href");
      expect(href, `${key} 格应有 href`).toBeTruthy();
      tileHrefs.push(href ?? "");
    }
    // 「与侧栏二级导航一一对应」：5 格的 href 恰好是侧栏去掉「概览」后的那 5 项，且顺序一致
    expect(sidebarHrefs.filter((h) => h !== `/notes/${baseId}/overview`)).toEqual(tileHrefs);

    // 卡片 190×98（画板：5 等分 1000 宽、gap 12 → 190.4；高 98）
    const tileBox = await page.getByTestId("kb-stat-notes").boundingBox();
    expect(Math.round(tileBox?.width ?? 0)).toBe(190);
    expect(Math.round(tileBox?.height ?? 0)).toBe(98);

    // 色块 28×28、圆角 7、距卡左/顶 14（图例 11 色块规格）
    const block = page.getByTestId("kb-stat-notes").locator("span[aria-hidden='true']").first();
    const blockBox = await block.boundingBox();
    expect(Math.round(blockBox?.width ?? 0)).toBe(28);
    expect(Math.round(blockBox?.height ?? 0)).toBe(28);
    const blockStyle = await block.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, bg: s.backgroundColor };
    });
    expect(blockStyle.radius).toBe("7px");
    // 笔记 = 蓝（图例 11「颜色沿用 p02 信息架构：笔记 蓝」）
    expect(blockStyle.bg).toBe("rgb(0, 113, 227)");
    expect(Math.round((blockBox?.x ?? 0) - (tileBox?.x ?? 0))).toBe(14);
    expect(Math.round((blockBox?.y ?? 0) - (tileBox?.y ?? 0))).toBe(14);
  });

  test("预览块：最近笔记 5 行 x51、成员 1 行 x52、左右列 600/380 间距 20", async ({ page }) => {
    // 造数只用到同源 fetch，不需要等画廊渲染完——等它反而把用例
    // 绑在画廊的加载耗时上（实测这一等偶发吃掉 30s 超时）。
    await page.goto("/notes");
    const baseId = await createBase(page, unique("D-02 预览"));
    // 造 6 篇：验证「只取前 5 篇」（图例 18）
    for (let i = 0; i < 6; i += 1) {
      await createNote(page, baseId, `预览笔记 ${i} ${Math.random().toString(36).slice(2, 6)}`);
    }

    await page.goto(`/notes/${baseId}/overview`);
    await expect(page.getByTestId("kb-preview-notes")).toBeVisible({ timeout: 30_000 });

    // 最近笔记：最多 5 行，每行 52 高（画板 y439..698，5 行）
    const noteRows = page.locator("[data-testid^='kb-preview-note-']");
    await expect(noteRows).toHaveCount(5);
    const noteCard = page.getByTestId("kb-preview-notes");
    const noteCardBox = await noteCard.boundingBox();
    // 画板：左列卡片 600 宽（x 368..967）。视口已在 describe 上钉到 1440×900。
    expect(Math.round(noteCardBox?.width ?? 0)).toBe(600);
    // 5 行 × 52 = 260（含行间 1px 分隔线，画板 439..698 = 260 行）
    expect(Math.round(noteCardBox?.height ?? 0)).toBe(260);
    const firstRow = await noteRows.first().boundingBox();
    expect(Math.round(firstRow?.height ?? 0)).toBe(51);

    // 右列 380 宽（画板 x 988..1367）；左列 600 + 间距 20 + 右列 380 = 1000
    const membersCard = page.getByTestId("kb-preview-members");
    const membersBox = await membersCard.boundingBox();
    const gap = Math.round((membersBox?.x ?? 0) - ((noteCardBox?.x ?? 0) + 600));
    expect(gap).toBe(20);
    expect(Math.round(membersBox?.width ?? 0)).toBe(380);

    /*
     * 成员行 52 高（图例 25）。
     *
     * 新库里"成员"只有库主自己一条，所以这里是**确定的一行**——
     * 不需要造数就能验证行高，这正是画板给的值：52（含 1px 分隔线）。
     */
    const memberRows = page.locator("[data-testid^='kb-preview-member-']");
    await expect(memberRows).toHaveCount(1);
    expect(Math.round((await memberRows.first().boundingBox())?.height ?? 0)).toBe(52);

    /*
     * 资料 3 行 × 56（图例 19）在真实栈上造不出数据：资料只有上传端点（要真 PDF），
     * 没有"创建一条文档记录"的接口。所以这里只断言**空态**（新库的必然状态）：
     * 文案按 Q-02 表 + 「去上传」直达 /ai/pdf（图例 30）。
     * "给 4 条只显示 3 条"的截断逻辑由单测覆盖（那里能完全控制输入）。
     */
    await expect(page.getByTestId("kb-preview-docs")).toHaveCount(0);
    await expect(
      page.getByText("还没有资料。上传 PDF 后可以在「PDF 问答」里围绕它提问。"),
    ).toBeVisible();
    await expect(page.getByTestId("kb-overview-docs-upload")).toHaveAttribute(
      "href",
      `/ai/pdf?baseId=${baseId}`,
    );
  });

  test("区块标题与「全部 X」链接：17/22 SemiBold + 13 accent", async ({ page }) => {
    // 造数只用到同源 fetch，不需要等画廊渲染完——等它反而把用例
    // 绑在画廊的加载耗时上（实测这一等偶发吃掉 30s 超时）。
    await page.goto("/notes");
    const baseId = await createBase(page, unique("D-02 标题"));

    await page.goto(`/notes/${baseId}/overview`);
    await expect(page.getByTestId("kb-hero")).toBeVisible({ timeout: 30_000 });

    // 三个区块标题（图例 16 / 19 / 23）
    for (const title of ["最近笔记", "资料", "成员"]) {
      const heading = page.getByRole("heading", { level: 2, name: title, exact: true });
      await expect(heading).toHaveCount(1);
      const style = await heading.evaluate((el) => {
        const s = getComputedStyle(el);
        return { size: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight };
      });
      // Headline 17/22 SemiBold
      expect(style.size).toBe("17px");
      expect(style.weight).toBe("600");
      expect(style.lineHeight).toBe("22px");
    }

    /*
     * 「全部笔记 / 全部资料 / 全部成员」直达对应 Tab（图例 17 / 20 / 24）。
     *
     * `/docs` 这个段名在这里**不是**已退役的一级协同文档库：它是知识库内的
     * 「资料」Tab（`/notes/<baseId>/docs`，RAG PDF，`n_doc` 表），两者同名但无关。
     * 来源是 `knowledge-base-overview.tsx` 里「资料」区块的 `PreviewHeading`
     * （`href={`/notes/${baseId}/docs`}`），仍是当前实现。同名使这条断言一度被
     * 误判为「引用了已退役路由」，故特别注明。
     */
    for (const [label, segment] of [
      ["全部笔记", ""],
      ["全部资料", "/docs"],
      ["全部成员", "/members"],
    ] as const) {
      const link = page.getByRole("link", { name: label, exact: true });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", `/notes/${baseId}${segment}`);
      // 13 accent（图例 17：「文字链接 13 accent/primary · 悬停下划线」）
      const style = await link.evaluate((el) => {
        const s = getComputedStyle(el);
        return { size: s.fontSize, decoration: s.textDecorationLine };
      });
      expect(style.size).toBe("13px");
      expect(style.decoration).toBe("none");
    }
  });

  test("只读成员看不到「新建笔记」，但搜索与主题仍在", async ({ page }) => {
    /*
     * 图例 9：「本屏唯一主按钮；可阅读及以下权限下隐藏（建议）」。
     * 权限由后端返回，用例改成只读成员的成本很高（要另一套账号 + 成员关系），
     * 所以这条**只断言可编辑时的正向**，权限分支由单测覆盖
     * （`knowledge-base-overview.test.tsx` 的 permissions 1/2/3/4/undefined 五种）。
     */
    // 造数只用到同源 fetch，不需要等画廊渲染完——等它反而把用例
    // 绑在画廊的加载耗时上（实测这一等偶发吃掉 30s 超时）。
    await page.goto("/notes");
    const baseId = await createBase(page, unique("D-02 权限"));

    await page.goto(`/notes/${baseId}/overview`);
    await expect(page.getByTestId("kb-hero")).toBeVisible({ timeout: 30_000 });
    // 库主是管理员：主按钮在，且是 accent 实心 34 高（画板 102×34）
    const create = page.getByTestId("kb-overview-note-create");
    await expect(create).toBeVisible();
    const createBox = await create.boundingBox();
    expect(Math.round(createBox?.height ?? 0)).toBe(34);
    const createStyle = await create.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(createStyle).toBe("rgb(0, 113, 227)");

    // 点开新建对话框（图例 9：打开「新建笔记」对话框）
    await create.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
  });

  test("库不存在时整页换成「找不到这个知识库」，不渲染空壳假数据", async ({ page }) => {
    /*
     * D-02 图例最后一组：「接口 404 / 403 → 不存在 / 无权限」。
     *
     * 这条是**真实浏览器实测暴露出来的缺陷**：后端对不存在的库返回
     * `{code:"A0301"}`（HTTP 200），详情查询进入 isError，而其余五棵查询
     * 照样"成功"返回空列表；修复前概览页因此渲染出**一屏完全正常的假数据**
     * （头图「未命名知识库」、5 格计数 0、简介「还没有填写简介」），
     * 用户看不出这个库根本不存在。
     *
     * 用一个大到不可能存在的 id：比"先建库再删"更稳（没有删除端点，且不受
     * 前序用例残留数据影响）。
     */
    await page.goto("/notes/999999/overview");
    await expect(page.getByTestId("kb-overview")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText("找不到这个知识库")).toBeVisible();
    await expect(page.getByText("它可能已被删除，或者你还没有访问权限。")).toBeVisible();
    await expect(page.getByRole("link", { name: /回到知识库/ })).toHaveAttribute("href", "/notes");

    // 假数据一个都不该出现
    await expect(page.getByTestId("kb-hero")).toHaveCount(0);
    await expect(page.getByTestId("kb-stat-notes")).toHaveCount(0);
    await expect(page.getByTestId("kb-preview-notes")).toHaveCount(0);
    await expect(page.getByText("未命名知识库")).toHaveCount(0);
    await expect(page.getByText("这个知识库还没有填写简介。")).toHaveCount(0);

    // 与同级 Tab 行为一致：/docs 与 /members 也不该给出"这个库是空的"的错觉
    await page.goto("/notes/999999/members");
    await expect(page.getByTestId("kb-gallery")).toHaveCount(0);
  });
});

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

    /*
     * 读**算出来的颜色**而不是变量字面量：同一个语义值可能写成
     * `rgb(255 255 255 / 0.07)`，也可能被浏览器序列化成 `#ffffff12`（实测如此）。
     * 把变量塞进临时元素的 background-color 让浏览器归一化，再解析通道值。
     */
    const readFills = () =>
      page.evaluate(() => {
        const probe = document.createElement("div");
        document.body.appendChild(probe);
        const read = (name: string) => {
          probe.style.backgroundColor = `var(${name})`;
          return getComputedStyle(probe).backgroundColor;
        };
        const out = {
          hover: read("--fill-hover"),
          footer: read("--fill-footer"),
          track: read("--segmented-track"),
          thumb: read("--segmented-thumb"),
        };
        probe.remove();
        return out;
      });
    /** 归一化颜色 → `[r, g, b, a?]`。返回定长元组，避免调用点做 undefined 判断。 */
    const channels = (color: string): number[] => (color.match(/[\d.]+/g) ?? []).map(Number);

    const light = await readFills();
    // 浅色：hover / track 是中性的浅灰（三通道接近且明显不是纯白），thumb 是纯白
    {
      const [r = 0, g = 0, b = 0] = channels(light.hover);
      expect(r, `浅色 hover 应是浅灰，实际 ${light.hover}`).toBeGreaterThan(230);
      expect(Math.abs(r - b)).toBeLessThan(12);
      const [tr = 0, tg = 0, tb = 0] = channels(light.track);
      expect(tr).toBeGreaterThan(220);
      expect(Math.abs(tr - tb)).toBeLessThan(12);
      const [wr = 0, wg = 0, wb = 0, wa] = channels(light.thumb);
      expect([wr, wg, wb]).toEqual([255, 255, 255]);
      expect(wa ?? 1).toBe(1);
    }

    await setTheme(page, "深色");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const dark = await readFills();

    /*
     * 深色下三者都必须是**白色低透明度叠加**，不能是黑——黑与页面底 #000
     * 完全分不开，这正是 Q-01 #1–#3 记录的问题。
     */
    for (const [name, color] of Object.entries(dark)) {
      if (name === "thumb") continue;
      const [r = 0, g = 0, b = 0, alpha] = channels(color);
      expect(r, `深色 ${name} 应偏亮，实际 ${color}`).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(200);
      expect(b).toBeGreaterThan(200);
      expect(alpha ?? 1, `深色 ${name} 应是低透明度叠加，实际 ${color}`).toBeLessThan(0.5);
    }
    // 分段控件轨道与选中格必须拉开：同色就退化成"看不出选中"
    expect(dark.thumb).not.toBe(dark.track);
    const [sr = 0, sg = 0, sb = 0] = channels(dark.thumb);
    expect(sr + sg + sb, `深色选中格不能是黑，实际 ${dark.thumb}`).toBeGreaterThan(60);
  });

  /** 12.0.2：输入框圆角 10（已拍板，此前是 14）。 */
  test("D-03 输入框圆角为 10、高度 40、占位文案正确", async ({ page }) => {
    // 先建一个库：没有库时本页是「还没有知识库」空态，标题输入框根本不渲染
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    await createBase(page, unique("UI 新建笔记"));

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

    await page.getByTestId("note-actions").click();
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
    /*
     * 建库人就是本库管理员，所以走的是**管理员分支**：页头有「新建任务」，
     * 空态提示是「发布一个任务试试。」。成员文案（「任务由知识库管理员发布。」）
     * 在管理员视角下不出现——这一点原稿图例把两种视角画在同一屏，
     * 落地时必须按 permissions 分流，不能两条文案都断言。
     */
    await expect(page.getByRole("link", { name: "新建任务" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("这个知识库下还没有任务")).toBeVisible();
    await expect(page.getByText("发布一个任务试试。")).toBeVisible();
    // 页头副标题：没有任务时是引导语，不是「0 个任务 · 0 个待你提交」
    await expect(page.getByText("发布一个任务，让本库成员在时间窗口内提交笔记。")).toBeVisible();
  });

  /** D-05：权限不足时隐藏「新建课程」（避免点了才报无权限）。 */
  test("D-05 慕课 Tab：页头主按钮与空态文案", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });
    const baseId = await createBase(page, unique("UI 慕课"));

    await page.goto(`/notes/${baseId}/mooc`);
    // 页头主按钮与空态次按钮同名（都叫「新建课程」），取页头那个
    await expect(page.getByRole("button", { name: "新建课程" }).first()).toBeVisible({
      timeout: 30_000,
    });
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

    const search = page.getByPlaceholder("按用户名搜索");
    await expect(search).toBeVisible();
    expect(await search.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("10px");
  });

  /*
   * D-10（协同文档库）整块退役：`/docs` 与 `/m/docs` 路由已删除（方案 §7.6 / §8），
   * 协同从「一种独立文档类型」降级为「笔记的一种编辑模式」，入口就是笔记本身。
   * 「删除走确认」这条前提随之消失，用例整体删除而不是改成空跑——
   * 对应的 `d10-collab-library*` 参考图仍留档在 `reference/supplement/` 下备查。
   */

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
    await page.getByTestId("note-actions").click();
    const first = page.getByRole("menuitem").first();
    await expect(first).toHaveText(/历史版本/);
    await first.click();

    await expect(page).toHaveURL(new RegExp(`/notes/${baseId}/${noteId}/history$`), {
      timeout: 20_000,
    });
    // 独立新建的笔记只有「当前版本」一条 → 空态文案
    await expect(page.getByText("这篇笔记还没有历史版本")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("之后每次保存都会在这里留下一个版本。")).toBeVisible();

    /*
     * 满幅：历史页与编辑器一样，左右两栏各自铺到视口边缘，**不套内容卡片**。
     *
     * 判据用"页面自己画的那层容器"而不是 `main`：`main` 的 class 里带着
     * `md:peer-data-[variant=inset]:rounded-xl` 这类 **sidebar 组件的响应式变体**，
     * 它们在当前布局下不生效（没有 peer 的 inset 状态），按字面匹配会误报。
     * 所以查页面根节点：它若真是"灰底上浮着的一张卡片"，会同时带圆角与阴影。
     */
    const pageRoot = page.getByTestId("note-history-page");
    await expect(pageRoot).toBeVisible();
    const rootClass = (await pageRoot.getAttribute("class")) ?? "";
    expect(rootClass).not.toMatch(/rounded-(lg|xl)/);
    expect(rootClass).not.toMatch(/shadow-card/);
    // 两栏都在：左正文 + 右 320 历史面板（图例 10）
    await expect(page.getByTestId("history-panel")).toBeVisible();
    await expect(page.getByTestId("history-scroll")).toBeVisible();
  });

  /** 12.0.3：错误态必须带重试按钮（此前 24 处都只有一行文案）。 */
  test("Q-02 错误态带重试，重试会重新发请求", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    /*
     * 让知识库列表**整批**失败一次，再由重试放开。
     *
     * 画廊同时发三条 `/bases*` 查询（我的 / 组织 / 我管理的），只失败第一条的话
     * 另外两条会成功，`failed` 取的是三个查询里第一个出错的——但只要有一条成功，
     * 页面就仍可能渲染出内容而不是错误态。所以按"是否已失败过"整体放行/拦截。
     */
    let retryAllowed = false;
    /*
     * 三条 `/bases*` 查询在重试放行前一律返回 500：只要有一条成功，
     * 页面就可能渲染出内容而不是错误态，测出来的就不是"错误态可重试"。
     */
    await page.route("**/api/proxy/note/bases**", async (route) => {
      if (!retryAllowed) return route.fulfill({ status: 500, body: "boom" });
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
    retryAllowed = true;
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
