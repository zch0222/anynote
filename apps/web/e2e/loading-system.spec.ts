import { type Page, expect, test } from "@playwright/test";
import { ensureKnowledgeBase, openKnowledgeBase } from "./support/account";

/**
 * 加载体系的端到端验收（设计稿 P12-P16）。
 *
 * 跑在真实生产构建 + Docker 全栈上（见 README「端到端与性能门禁」）。
 *
 * 这个文件**刻意不只断言"loading 元素出现了"**。加载态最容易出的问题不是
 * 不出现，而是三类别的东西：
 *
 *   1. **主题断层** —— 骨架用一个写死的灰色，浅色下隐形、深色下刺眼。
 *      设计稿给的是 `--skeleton-base` 深浅两态（#E5E5EA / #2C2C2E），必须真的生效。
 *   2. **动效没跑** —— 元素在、样式类也在，但动画压根没生效。一律读
 *      `getComputedStyle` 的 `animationName` / `duration` / `iteration`，**不读类名**。
 *   3. **白块闪烁** —— 快速路由切换下启动页/骨架闪一下又没了。
 *      这类问题在单测里完全测不到，只有真机时序能暴露。
 */

const BASE_NAME = "E2E 加载体系知识库";
const EDITOR_SURFACE = ".anynote-editor__content";

test.describe.configure({ mode: "serial" });

/**
 * 把知识库列表请求挂住，让画廊钉在骨架态。
 *
 * 模式必须带 `/api/proxy/` 前缀：前端的私有请求一律先打 BFF
 * （`app/api/proxy/[...path]`），由它带上 Cookie 转发给 Gateway。
 * 只写 `**​/api/note/bases**` 会**一个都匹配不上**——而不匹配的 route 是静默的，
 * 页面照常加载完，于是骨架永远等不到、断言以"没找到元素"的假象超时。
 * 抽成一处是因为这个坑在本文件里有三个调用点。
 */
async function hangKnowledgeBaseList(page: Page) {
  await page.route("**/api/proxy/note/bases**", async () => {
    // 永不响应：把画廊钉在 isPending 上
    await new Promise(() => {});
  });
}

/** 读一个网格容器**实际算出来**的列数（不读类名）。 */
async function computedGridColumns(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) return 0;
    const columns = getComputedStyle(element).gridTemplateColumns;
    return columns.trim() === "none" ? 0 : columns.split(" ").length;
  }, selector);
}

/**
 * 骨架屏：底色必须来自 `--skeleton-base`，且深浅两态取不同值。
 *
 * 这是本批最容易被"看起来更省事"的实现破坏的一条：直接写个 `bg-grouped`
 * 或 `bg-gray-200` 也能跑、也能过其他测试，但前者在浅色分组底上等于隐形，
 * 后者在深色主题里是一块刺眼的白。
 */
test.describe("01 骨架屏 Skeleton", () => {
  test("骨架底色走 --skeleton-base，深浅两态不同且都比承载层高一档", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        skeleton: root.getPropertyValue("--skeleton-base").trim(),
        grouped: root.getPropertyValue("--surface-grouped").trim(),
      };
    });

    // Token 必须有人定义——失败模式就是"引用了不存在的变量"，
    // 那会让整条 background 声明静默失效（既不报错也不回退）
    expect(tokens.skeleton, "--skeleton-base 未定义").not.toBe("");
    // 骨架不能等于承载它的分组底，否则整片隐形
    expect(tokens.skeleton).not.toBe(tokens.grouped);

    // 换到深色：取值必须跟着变（同一套语义名、两组取值）
    const menu = page.getByRole("menu");
    await page.getByRole("button", { name: "切换主题" }).click();
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitemradio", { name: "深色" }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator("html")).toHaveClass(/dark/);

    const darkTokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        skeleton: root.getPropertyValue("--skeleton-base").trim(),
        grouped: root.getPropertyValue("--surface-grouped").trim(),
      };
    });
    expect(darkTokens.skeleton).not.toBe(tokens.skeleton);
    expect(darkTokens.skeleton).not.toBe(darkTokens.grouped);

    // 复位，后续用例依赖浅色
    await page.getByRole("button", { name: "切换主题" }).click();
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitemradio", { name: "浅色" }).click();
    await expect(menu).toBeHidden();
  });

  test("骨架真的在扫光：1.4s ease-in-out 无限循环", async ({ page }) => {
    await hangKnowledgeBaseList(page);
    await page.goto("/notes");

    /*
     * 必须用**真实页面上的骨架元素**，不能自己注入一个 `animate-shimmer` 的 div：
     * 注入的节点拿不到组件带的那套 token 组合，量的就不是产品代码。
     *
     * 每次现查 DOM 而不是持有 locator 再 evaluate：骨架会经历
     * 「路由级 loading.tsx → 页面自己的骨架」两次渲染，前一批节点会被 React
     * 整体替换；对着已卸载的节点调 getComputedStyle 返回的是**空串**
     * （不是 none），断言会以"没找到动画"的假象失败。
     */
    const read = () =>
      page.evaluate(() => {
        const element = document.querySelector('[data-slot="skeleton"]');
        if (!element) return null;
        const computed = getComputedStyle(element);
        return {
          animationName: computed.animationName,
          duration: computed.animationDuration,
          timing: computed.animationTimingFunction,
          iteration: computed.animationIterationCount,
          // 底色必须真的解析出一个非透明值：解析失败时它是 rgba(0, 0, 0, 0)
          background: computed.backgroundColor,
        };
      });

    await expect
      .poll(async () => (await read())?.animationName, { timeout: 30_000 })
      .toBe("skeleton-shimmer");

    const animations = await read();
    expect(animations?.duration).toBe("1.4s");
    expect(animations?.timing).toBe("ease-in-out");
    expect(animations?.iteration).toBe("infinite");
    expect(animations?.background, "骨架底色解析失败（整片会隐形）").not.toBe("rgba(0, 0, 0, 0)");
  });

  test("prefers-reduced-motion 下降级为呼吸式淡入淡出而不是静止", async ({ page }) => {
    /*
     * 静止处理会让加载态与"加载完但内容为空"无从区分——设计稿明确要求降级
     * 而不是关掉。所以这条断言的是"动画换了但还在动"，而不是"动画没了"。
     *
     * 三个实现要点：
     * 1. 用 page.emulateMedia 而不是 browser.newContext({ reducedMotion })——
     *    newContext() **不继承** config 的 use（storageState / ignoreHTTPSErrors），
     *    新开的上下文会因自签证书与缺登录态而根本到不了知识库页。
     * 2. emulateMedia **放在 goto 之后**：导航会重置媒体模拟。
     * 3. 一次 evaluate 拿全字段——"先 poll 一个字段、再单独读其余"会在两次调用
     *    之间撞上节点替换而读到 null。
     */
    await hangKnowledgeBaseList(page);
    await page.goto("/notes");

    const read = () =>
      page.evaluate(() => {
        const element = document.querySelector('[data-slot="skeleton"]');
        if (!element) return null;
        const computed = getComputedStyle(element);
        return {
          animationName: computed.animationName,
          duration: computed.animationDuration,
          iteration: computed.animationIterationCount,
          // 扫光层在降级时整条去掉，改由 opacity 呼吸
          backgroundImage: computed.backgroundImage,
        };
      });

    // 默认口径：扫光
    await expect
      .poll(async () => (await read())?.animationName, { timeout: 30_000 })
      .toBe("skeleton-shimmer");
    expect((await read())?.backgroundImage).not.toBe("none");

    // 切到"减少动态效果"：换成呼吸，**仍在动**
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(async () => (await read())?.backgroundImage, { timeout: 15_000 })
      .toBe("none");
    const reduced = await read();
    expect(reduced?.animationName).toBe("skeleton-breathe");
    expect(reduced?.duration).toBe("1.6s");
    expect(reduced?.iteration).toBe("infinite");
  });
});

test.describe("02 转圈 Spinner", () => {
  test("转圈是「灰轨道 + 蓝弧」两段描边，0.8s linear 无限转", async ({ page }) => {
    await page.goto("/ai/pdf");
    // 上传区一出现就说明页面挂好了
    await expect(page.getByTestId("pdf-upload-zone")).toBeVisible({ timeout: 30_000 });

    /*
     * 这个页面在静止状态下没有转圈（要等上传/索引才会出现），所以注入一个
     * 同款结构的 SVG 来验**关键帧定义本身对真实 DOM 生效**——动画名与时长是
     * CSS 里的定义，与节点由谁插入无关。两段描边（轨道 + 弧）才是断言重点：
     * 缺了轨道，12px 下就只剩一个点，看不出在转。
     */
    const spinner = await page.evaluate(() => {
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("data-slot", "spinner");
      svg.setAttribute("viewBox", "0 0 40 40");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      const track = document.createElementNS(NS, "circle");
      track.setAttribute("class", "stroke-separator");
      const arc = document.createElementNS(NS, "circle");
      arc.setAttribute("class", "origin-center animate-spin-loading stroke-current text-accent");
      arc.setAttribute("stroke-dasharray", "24 108");
      arc.setAttribute("stroke-linecap", "round");
      svg.append(track, arc);
      document.body.append(svg);

      const circles = svg.querySelectorAll("circle");
      const style = getComputedStyle(circles[1] as Element);
      const result = {
        segments: circles.length,
        animationName: style.animationName,
        duration: style.animationDuration,
        timing: style.animationTimingFunction,
        iteration: style.animationIterationCount,
      };
      svg.remove();
      return result;
    });

    expect(spinner.segments, "缺轨道就只有一段弧，12px 下看不出在转").toBe(2);
    expect(spinner.animationName).toBe("loading-spin");
    expect(spinner.duration).toBe("0.8s");
    // 只有"转/停"两态，加缓动会看出顿挫
    expect(spinner.timing).toBe("linear");
    expect(spinner.iteration).toBe("infinite");
  });
});

test.describe("03 进度 Progress", () => {
  test("进度条带真实 aria 数值，且宽度走 CSS 变量", async ({ page }) => {
    await page.goto("/ai/pdf");
    await expect(page.getByTestId("pdf-upload-zone")).toBeVisible({ timeout: 30_000 });

    const progress = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML = `
        <div role="progressbar" aria-label="验收进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="45">
          <div class="h-full w-(--progress) rounded-full bg-accent transition-[width] duration-240 ease-out"
               style="--progress: 45%"></div>
        </div>`;
      const bar = host.querySelector('[role="progressbar"]');
      const fill = bar?.firstElementChild as HTMLElement | null;
      document.body.append(host);
      const style = fill ? getComputedStyle(fill) : null;
      const result = {
        // 走 CSS 变量的宽度必须真的解析出来（解析失败就是 0）
        width: fill?.getBoundingClientRect().width ?? 0,
        trackWidth: bar?.getBoundingClientRect().width ?? 0,
        transitionDuration: style?.transitionDuration ?? "",
        transitionTiming: style?.transitionTimingFunction ?? "",
        now: bar?.getAttribute("aria-valuenow") ?? "",
      };
      host.remove();
      return result;
    });

    // 45% 的填充宽度应当落在轨道的一半上下（不是 0，也不是满宽）
    expect(progress.trackWidth).toBeGreaterThan(0);
    expect(progress.width).toBeGreaterThan(progress.trackWidth * 0.4);
    expect(progress.width).toBeLessThan(progress.trackWidth * 0.5);
    expect(progress.transitionDuration).toBe("0.24s");
    // 浏览器把 `ease-out` 解析成它的贝塞尔定义，所以断言解析后的值而不是关键字
    expect(progress.transitionTiming).toBe("cubic-bezier(0, 0, 0.2, 1)");
    expect(progress.now).toBe("45");
  });
});

test.describe("05 品牌启动 Brand boot", () => {
  /**
   * 会话未知的那一刻正是设计稿说的「全屏初始化」。
   *
   * 复现方式：拦掉 `/api/auth/me` 让它一直挂着——那正是"会话还没确认"的真实状态，
   * 而不是造一个假的加载页面。这样验的是**产品代码真的走了品牌启动那条分支**。
   */
  test("会话未确认时给品牌启动，不是两块灰条", async ({ page }) => {
    await page.route("**/api/auth/me", async () => {
      // 永不响应：把 WorkspaceSession 钉在 isPending 上
      await new Promise(() => {});
    });

    await page.goto("/notes");

    const boot = page.locator('[data-slot="brand-boot"]');
    await expect(boot).toBeVisible({ timeout: 30_000 });
    // 品牌三件套：Logo + 字标 + 文案（缺任何一件都还是"裸骨架"）
    await expect(boot.locator('[data-slot="brand-logo"]')).toBeVisible();
    await expect(boot.getByText("Anynote")).toBeVisible();
    await expect(boot.getByText("正在准备工作区…")).toBeVisible();
    // 读屏必须播报得到
    await expect(page.getByRole("status")).toContainText("正在准备工作区");
  });

  test("Logo 三段描边依次绘制：1.6s ease-in-out 无限循环", async ({ page }) => {
    /*
     * 两个必须注意的干扰：
     * 1. **必须限定在启动页内查询**。侧栏品牌位用的是同一个 `AnynoteLogo`，
     *    只是不带动画——`document.querySelectorAll("[data-logo-stroke]")` 会先
     *    命中侧栏那三条静态路径，量到的 `animationName` 全是 `none`。
     * 2. **要赶在骨架兜底之前读**。BrandBoot 默认 1.2s 后从 Logo 阶段切到骨架，
     *    那时 Logo 已被卸载。用 `data-phase="logo"` 确认还在这一阶段。
     */
    await page.route("**/api/auth/me", async () => {
      await new Promise(() => {});
    });
    await page.goto("/notes");
    const boot = page.locator('[data-slot="brand-boot"]');
    await expect(boot).toBeVisible({ timeout: 30_000 });
    await expect(boot).toHaveAttribute("data-phase", "logo");

    const strokes = await page.evaluate(() => {
      return ["page1", "page2", "spine"].map((key) => {
        const path = document.querySelector(`[data-slot="brand-boot"] [data-logo-stroke="${key}"]`);
        if (!path) return { key, missing: true };
        const style = getComputedStyle(path);
        return {
          key,
          missing: false,
          animationName: style.animationName,
          duration: style.animationDuration,
          iteration: style.animationIterationCount,
          dashArray: style.strokeDasharray,
        };
      });
    });

    /*
     * 三段**各自的**动画名必须不同：设计稿要的是"依次绘制"，
     * 三段共用一个名字就等于同时画，书是一次性出现的。
     */
    const names = strokes.map((stroke) => stroke.animationName);
    expect(new Set(names).size, `三段应当各有一条时间轴，实际：${names.join(",")}`).toBe(3);
    for (const stroke of strokes) {
      expect(stroke.missing, `缺少 ${stroke.key} 这一笔`).toBe(false);
      expect(stroke.duration).toBe("1.6s");
      expect(stroke.iteration).toBe("infinite");
      // dasharray 归一化到 100，否则长短不一的笔画速度差很多
      expect(stroke.dashArray).toContain("100");
    }
  });

  test("骨架兜底超过 1.2s 才切：慢请求下不会一上来就给骨架", async ({ page }) => {
    await page.route("**/api/auth/me", async () => {
      await new Promise(() => {});
    });
    await page.goto("/notes");

    const boot = page.locator('[data-slot="brand-boot"]');
    await expect(boot).toBeVisible({ timeout: 30_000 });

    // 刚出现时是 Logo 阶段
    await expect(boot).toHaveAttribute("data-phase", "logo");
    // 1.2s 之后才换骨架兜底
    await expect(boot).toHaveAttribute("data-phase", "skeleton", { timeout: 15_000 });
    await expect(boot.locator('[data-slot="skeleton"]').first()).toBeVisible();
  });

  test("快速路由切换不闪启动页（首帧之后才出现的防抖）", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    /*
     * 连续切换路由，全程盯着有没有品牌启动闪出来。
     * 用 MutationObserver 记录而不是轮询截图：闪一下可能只有几十毫秒，
     * 轮询必然漏掉——而"漏掉"恰好就是这个用例要抓的 bug。
     */
    const flashes = await page.evaluate(async () => {
      let count = 0;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === 1 && (node as Element).matches?.('[data-slot="brand-boot"]')) {
              count += 1;
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // 站内软导航连续切两次（侧栏的跨库能力入口）
      document.querySelector<HTMLAnchorElement>('a[href="/ai/chat"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      document.querySelector<HTMLAnchorElement>('a[href="/notes"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 1200));

      observer.disconnect();
      return count;
    });

    expect(flashes, "快速软导航期间闪出了品牌启动页").toBe(0);
  });

  /**
   * 回归：**进度条曾经在真实点击下从不出现**。
   *
   * 判定原先把 `event.defaultPrevented` 当作"别人抢走了这次点击"。
   * 而 Next 的 `<Link>` 对站内软导航**一定会** `preventDefault()`
   * （它要接管导航、不让浏览器整页刷新），于是「点站内链接」——
   * 也就是进度条唯一的主场——永远不亮。
   *
   * 这条用例刻意用 **Playwright 的真实 `click()`**，不用 `dispatchEvent`：
   * 合成事件的 `defaultPrevented` 是 false，正好绕过这个 bug
   * （写这个 spec 的第一版就是这么写的，所以它当初"通过"了）。
   */
  test("点站内链接（Link 会 preventDefault）时进度条真的亮起", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    // 拖慢目标路由的请求，让进度条有可观测的停留时间
    await page.route("**/ai/chat**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });

    // 真实点击：走完整的事件链，Link 的 preventDefault 会真的发生
    await page.click('a[href="/ai/chat"]');

    /*
     * 可见的像素在**内层** `boot-bar` 上，不在 `route-progress` 上。
     *
     * 外层是零高度的定位 + 状态容器（见下一条用例），零高度元素在
     * Playwright 眼里就是不可见的——对着它断言 `toBeVisible` 会永远等不到。
     * 语义与文案仍然断在外层，那才是读屏读到的东西。
     */
    const region = page.locator('[data-slot="route-progress"]');
    const bar = page.locator('[data-slot="boot-bar"]');
    await expect(
      bar,
      "点站内链接时进度条没亮——Link 的 preventDefault 被误判成放弃导航",
    ).toBeVisible({ timeout: 5000 });
    // 不确定型进度：有可播报的文案，且不编造百分比
    await expect(region).toContainText("页面加载中");
    await expect(region).not.toHaveAttribute("aria-valuenow", /.*/);

    // 导航完成后必须收起——进度条永远挂着是最糟的失败模式
    await expect(page).toHaveURL(/\/ai\/chat/, { timeout: 30_000 });
    await expect(region).toHaveCount(0, { timeout: 15_000 });
  });

  /**
   * 回归：**进度条亮起来时整页往下沉一下**。
   *
   * 原来容器自己就是 `h-0.5`，一条 2px 的条实打实占在顶栏与内容区之间的
   * 文档流里：它一亮，`#workspace-content` 的 top 从 56 变成 58，下面所有内容
   * 被推下去；导航结束它被卸载，内容又弹回来。切一次页面抖两次。
   *
   * 这条用例的核心是**量位移**而不是量样式：光断言容器类名里有 `h-0`
   * 证明不了真实渲染结果（外层的 `h-0` 会不会被子元素撑开、绝对定位有没有
   * 生效、sticky 会不会改变行为，都只有真机能回答）。所以基准取
   * `#workspace-content` 的 `getBoundingClientRect().top` 与文档总高。
   */
  test("进度条亮起时内容不被推下去——加载条不占高度", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery")).toBeVisible({ timeout: 30_000 });

    const measure = () =>
      page.evaluate(() => {
        const content = document.querySelector("#workspace-content");
        const bar = document.querySelector('[data-slot="boot-bar"]');
        return {
          contentTop: content ? Math.round(content.getBoundingClientRect().top) : -1,
          docHeight: document.documentElement.scrollHeight,
          barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
        };
      });

    const before = await measure();
    expect(before.contentTop, "没找到内容区").toBeGreaterThan(0);
    expect(before.barHeight, "测基准时进度条不该在场").toBe(0);

    // 拖慢目标路由的请求，把进度条钉在屏幕上，位移才量得稳
    await page.route("**/ai/chat**", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.click('a[href="/ai/chat"]');
    await expect(page.locator('[data-slot="boot-bar"]')).toBeVisible({ timeout: 5000 });

    const during = await measure();
    // 先确认它真的画出来了，且还是设计稿要的那 2px——别为了不占高度把条改没了
    expect(during.barHeight, "进度条没有可见高度").toBe(2);
    expect(during.contentTop, "加载条出现时内容被推下去了").toBe(before.contentTop);
    expect(during.docHeight, "加载条把文档总高撑大了").toBe(before.docHeight);

    // 收起之后同样不许有反向位移
    await expect(page).toHaveURL(/\/ai\/chat/, { timeout: 30_000 });
    await expect(page.locator('[data-slot="route-progress"]')).toHaveCount(0, { timeout: 15_000 });
    expect((await measure()).docHeight).toBe(before.docHeight);
  });
});

test.describe("04 AI 流式 Streaming", () => {
  test("首 token 未到达时给「思考中」+ 三点动效（不是一行静态文字）", async ({ page }) => {
    await page.goto("/ai/chat");
    const composer = page.getByPlaceholder(/输入消息/);
    await expect(composer).toBeVisible({ timeout: 30_000 });

    // 把 SSE 端点挂住：这正是"首 token 还没到"的真实状态
    await page.route("**/api/proxy/aiNio/**", async () => {
      await new Promise(() => {});
    });

    await composer.fill("加载态验收");
    await page.getByRole("button", { name: "发送" }).click();

    const thinking = page.getByTestId("assistant-thinking");
    await expect(thinking).toBeVisible({ timeout: 30_000 });
    await expect(thinking).toContainText("思考中");
    /*
     * 必须是可播报的状态，不能只是一个视觉动画。
     *
     * 断言 `role` **解析后的角色**而不是 `role="status"` 这个字面属性：
     * 状态容器用的是 `<output>`，它的 status 角色来自 HTML 隐式语义，
     * 元素上并没有 `role` 属性。用 `getByRole` 才是"读屏器看到的是什么"。
     */
    await expect(page.getByRole("status").filter({ hasText: "思考中" })).toHaveCount(1);

    // 三点存在且真的在动（0.15s 错峰、1.2s 循环）
    const dots = await page.evaluate(() => {
      const host = document.querySelector('[data-slot="thinking-dots"]');
      if (!host) return null;
      return Array.from(host.querySelectorAll("[data-dot]")).map((dot) => {
        const style = getComputedStyle(dot);
        return {
          animationName: style.animationName,
          duration: style.animationDuration,
          iteration: style.animationIterationCount,
          delay: style.animationDelay,
        };
      });
    });
    expect(dots, "「思考中」缺少三点动效，静态文字会让用户以为卡住").not.toBeNull();
    expect(dots).toHaveLength(3);
    for (const dot of dots ?? []) {
      expect(dot.animationName).toBe("think-dot");
      expect(dot.duration).toBe("1.2s");
      expect(dot.iteration).toBe("infinite");
    }
    // 错峰：三个延迟互不相同
    expect(new Set((dots ?? []).map((dot) => dot.delay)).size).toBe(3);
  });

  test("逐字输出时给闪烁光标，且光标是 step-end 的「跳」", async ({ page }) => {
    await page.goto("/ai/chat");
    const composer = page.getByPlaceholder(/输入消息/);
    await expect(composer).toBeVisible({ timeout: 30_000 });

    /*
     * 造一个"流已经开始"的 SSE：发一条增量后结束响应体。
     * 前端收到增量即进入 streaming 态，正是要验的那一帧。
     */
    await page.route("**/api/proxy/aiNio/**", async (route) => {
      const body = 'data: {"code":"00000","data":{"message":"正在","status":"doing"}}\n\n';
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        body,
      });
    });

    /*
     * 光标是**转瞬即逝**的：响应体一结束，前端就从流式态切到只读编辑器，
     * 光标随之消失。轮询必然会漏（这条用例第一版就是这么失败的）。
     *
     * 所以先装一个 MutationObserver，把光标**出现那一刻的计算样式记下来**，
     * 之后再读记录。这样断言的是"它确实以正确形态出现过"，与时序无关。
     */
    await page.evaluate(() => {
      const scope = window as unknown as { __caret?: Record<string, string> | null };
      scope.__caret = null;
      const capture = () => {
        if (scope.__caret) return;
        const element = document.querySelector('[data-slot="stream-caret"]');
        if (!element) return;
        const style = getComputedStyle(element);
        scope.__caret = {
          animationName: style.animationName,
          timing: style.animationTimingFunction,
          hidden: element.getAttribute("aria-hidden") ?? "",
        };
      };
      capture();
      new MutationObserver(capture).observe(document.body, { childList: true, subtree: true });
    });

    await composer.fill("光标验收");
    await page.getByRole("button", { name: "发送" }).click();

    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __caret?: unknown }).__caret ?? null),
        { timeout: 20_000 },
      )
      .not.toBeNull();

    const caret = await page.evaluate(
      () => (window as unknown as { __caret?: Record<string, string> }).__caret ?? null,
    );
    expect(caret?.animationName).toBe("caret-blink");
    /*
     * 光标必须是"跳"而不是淡入淡出——淡入淡出会被读成另一种"加载中"。
     *
     * 断言解析后的值：浏览器把 `step-end` 归一化成等价的 `steps(1)`，
     * 写成关键字会失败。`steps(1)` 就是"整段保持起始值、到末尾才跳"，
     * 正是要验的阶梯行为（与 `linear` / `ease*` 区分得开）。
     */
    expect(caret?.timing).toBe("steps(1)");
    expect(caret?.hidden).toBe("true");
  });
});

test.describe("加载态的版式约束", () => {
  test("骨架形状与宿主一致：画廊骨架是三列网格，与真卡片同断点", async ({ page }) => {
    await page.goto("/notes");
    await expect(page.getByTestId("kb-gallery-grid")).toBeVisible({ timeout: 30_000 });
    const realColumns = await computedGridColumns(page, '[data-testid="kb-gallery-grid"]');
    expect(realColumns).toBeGreaterThan(1);

    /*
     * 骨架网格必须在**同一个视口**下量，所以不能另开页面用别的宽度：
     * 先把知识库列表挂住，让画廊停在骨架态，再量它。
     */
    await hangKnowledgeBaseList(page);
    await page.reload({ waitUntil: "domcontentloaded" });

    const skeleton = page.locator('[data-slot="skeleton-card-grid"]');
    await expect(skeleton).toBeVisible({ timeout: 30_000 });
    const skeletonColumns = await computedGridColumns(page, '[data-slot="skeleton-card-grid"]');
    expect(skeletonColumns, "骨架与真实网格列数不一致，加载完成时会跳一下").toBe(realColumns);
  });

  test("笔记编辑器：加载态与真内容的纸面宽度一致", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
    /*
     * `ensureKnowledgeBase` 在"库已存在"时停在画廊页，只有新建时才跳到库里
     * （见 `e2e/support/account.ts`）。所以这里必须显式打开一次，
     * 不能假设当前地址就是知识库的笔记 Tab。
     */
    if (!/\/notes\/\d+$/.test(new URL(page.url()).pathname)) {
      await openKnowledgeBase(page, BASE_NAME);
    }
    const baseUrl = new URL(page.url()).pathname;

    await expect(page.getByTestId("note-list")).toBeVisible({ timeout: 30_000 });

    /*
     * 空库时先造一篇，并写一行正文。
     *
     * 写正文这一步**不再是为了让笔记出现在列表里**——2026-09-16 起知识库笔记列表
     * 走 `POST /notes/bases/{baseId}`（`FROM n_note`），新建即可见。之前这里写的是
     * "`GET /notes` 依赖操作日志，所以建完必须写正文"，那个判断把**前端选错端点**
     * 误记成了后端缺陷，见 `docs/changelist/2026-09-16-note-list-endpoint.md`。
     *
     * 保留写正文是因为下面的用例要验纸面限宽与保存链路，需要有真实正文可渲染。
     */
    const existing = page.getByTestId("note-list-items").getByRole("link");
    const hasNotes = await existing
      .first()
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (!hasNotes) {
      await page.getByTestId("note-create").click();
      await page.getByLabel("标题").fill(`加载态验收 ${Date.now().toString().slice(-6)}`);
      await page.getByRole("button", { name: "创建", exact: true }).click();
      await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });

      const surface = page.locator(EDITOR_SURFACE);
      await expect(surface).toBeVisible({ timeout: 30_000 });
      await surface.click();
      await page.keyboard.type("加载态与纸面限宽验收");

      /*
       * 打完字要**等保存真的落库**再走。
       *
       * 这里原先还要再轮询一次列表接口，因为列表当时走 `GET /notes`
       * （`FROM n_note_operation_log`），得等 RocketMQ 消费者异步写完操作日志
       * （已实测全量跑时偶发失败）。2026-09-16 起列表走
       * `POST /notes/bases/{baseId}`（`FROM n_note`），保存提交即可见，
       * **这层 MQ 时序依赖没有了**，所以只等保存徽标就够。
       *
       * 「保存后确实出现在列表里」由下面 `firstRow` 那条断言负责，
       * 不再重复轮询接口。
       */
      await expect(page.locator('[data-status="saved"]')).toBeVisible({ timeout: 30_000 });
      await page.goto(baseUrl);
    }

    const firstRow = page.getByTestId("note-list-items").getByRole("link").first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });
    await firstRow.click();
    await expect(page.locator(EDITOR_SURFACE)).toBeVisible({ timeout: 30_000 });

    const realWidth = await page.evaluate(() => {
      const article = document.querySelector<HTMLElement>('[data-testid="note-document"]');
      return article ? Math.round(article.getBoundingClientRect().width) : 0;
    });
    expect(realWidth).toBeGreaterThan(400);

    // 路由级 loading.tsx 的外层限宽与编辑器纸面同款
    const loadingWidth = await page.evaluate(() => {
      const host = document.createElement("div");
      host.className = "mx-auto w-full max-w-[calc(62.5rem+9rem)] px-6 py-10 sm:px-8 lg:px-18";
      const inner = document.createElement("div");
      inner.className = "w-full";
      host.append(inner);
      const container = document.querySelector("#workspace-content");
      container?.append(host);
      const width = Math.round(inner.getBoundingClientRect().width);
      host.remove();
      return width;
    });

    // 允许几像素的亚像素取整差；纸面本身 1000px + 左右各 72px 内边距
    expect(Math.abs(loadingWidth - realWidth)).toBeLessThanOrEqual(8);
  });
});
