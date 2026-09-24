import { type Page, expect, test } from "@playwright/test";
import { ensureKnowledgeBase, openKnowledgeBase } from "./support/account";
import { focusWritableEditor } from "./support/editor";
import { expectNoteSaved } from "./support/save-status";
import { setTheme } from "./support/theme";

const BASE_NAME = "E2E 知识库";
const NOTE_TITLE = `E2E 笔记 ${Date.now().toString().slice(-6)}`;

// 第二条用例直接复用第一条创建出来的笔记地址：serial 模式下同一个 worker，
// 模块级变量能传下去，比再从列表里点一遍稳得多。
let noteUrl = "";

const EDITOR_SURFACE = ".anynote-editor__content";
const CONFLICT_TITLE = "这篇笔记已被其他会话修改";

/** 等编辑器可交互；正文是 dynamic 懒加载的，直接点会点空。 */
async function focusEditor(page: Page) {
  return focusWritableEditor(page);
}

/** 等保存落到终态；文案在协同模式下是「已同步」，所以判据走 `data-status`。 */
async function expectSaved(page: Page) {
  await expectNoteSaved(page);
}

test.describe.configure({ mode: "serial" });

test.describe("关键路径 2/3：创建笔记与编辑保存", () => {
  test("创建笔记后跳进编辑器", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);

    await page.goto("/notes/new");
    await page.getByLabel("标题").fill(NOTE_TITLE);
    await page.getByRole("button", { name: "创建笔记" }).click();

    // 创建成功会跳到 /notes/<baseId>/<noteId>，创建时填的标题以首节点 H1 落进正文
    await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });
    await expect(page.locator(".anynote-editor__content h1").first()).toHaveText(NOTE_TITLE, {
      timeout: 30_000,
    });
    noteUrl = page.url();
  });

  test("在编辑器里输入会自动保存，刷新后内容还在", async ({ page }) => {
    expect(noteUrl, "上一条用例未能创建笔记").not.toBe("");
    await page.goto(noteUrl);

    const marker = `自动保存校验 ${Date.now()}`;
    const surface = await focusEditor(page);
    await page.keyboard.type(marker);

    // 保存状态机：待保存 → 保存中 → 已保存
    await expectSaved(page);

    await page.reload();
    await expect(page.locator(EDITOR_SURFACE)).toContainText(marker, { timeout: 30_000 });
    await expect(surface).toBeVisible();
  });

  test("新建的笔记出现在知识库的笔记列表里", async ({ page }) => {
    await page.goto("/notes");
    await page
      .getByRole("link", { name: new RegExp(BASE_NAME) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/notes\/\d+$/, { timeout: 30_000 });
    await expect(page.getByText(NOTE_TITLE).first()).toBeVisible({ timeout: 30_000 });
  });
});

/**
 * 「新建完就在库里」的回归（2026-09-16 用户报障）。
 *
 * 上面那组用例**掩盖过这个 bug**：它建完笔记先进编辑器敲了字，而输入会把笔记
 * 操作日志写出来，于是列表查询（当时走 `GET /notes`，FROM `n_note_operation_log`）
 * 又能看到这篇笔记了。所以这条用例刻意放在**独立 describe** 里、且创建后
 * **一个字都不输入**——新建完立刻回列表找它，这才是用户报障的那条路径。
 */
test.describe("新建笔记：未编辑也必须在库里可见", () => {
  test("新建后不做任何编辑，返回列表即可见", async ({ page }) => {
    const baseName = `E2E 新建可见 ${Date.now().toString().slice(-6)}`;
    const title = `未编辑笔记 ${Date.now().toString().slice(-6)}`;
    await ensureKnowledgeBase(page, baseName);

    // 从知识库内的「新建笔记」进创建页（带 baseId），创建后回到这个库
    await openKnowledgeBase(page, baseName);
    const baseUrl = page.url();
    await page.getByTestId("note-create").click();
    await page.getByLabel("标题").fill(title);
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });
    const noteUrl = page.url();

    /*
     * 直接回列表页，不碰编辑器。
     *
     * 断言用 `note-row-<id>` 这个 testid 而不是文案：库名里也含时间戳，
     * 按文本匹配会同时命中页头与侧栏，分不清是"笔记行出来了"还是"库名撞上了"。
     */
    const noteId = Number(noteUrl.split("/").pop());
    await page.goto(baseUrl);
    await expect(page.getByTestId(`note-row-${noteId}`)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId(`note-row-${noteId}`)).toContainText(title);

    // 刷新后仍在：排除"只是乐观更新把行塞进了缓存"
    await page.reload();
    await expect(page.getByTestId(`note-row-${noteId}`)).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("笔记编辑器：布局与保存冲突", () => {
  test("编辑面板占满视口高度，长文在面板内部滚动而不是顶长整页", async ({ page }) => {
    expect(noteUrl, "缺少可用的笔记").not.toBe("");
    await page.goto(noteUrl);
    await focusEditor(page);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    // 重设计后"占满视口"的职责在编辑面板上（标题与元信息行是文章的一部分，跟着正文滚），
    // 不再是编辑器自己撑满——所以这里量面板，面板要吃掉页头之外的绝大部分高度。
    const panel = page.getByTestId("note-panel");
    await expect(panel).toBeVisible();
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox?.height ?? 0).toBeGreaterThan((viewport?.height ?? 0) * 0.6);

    // 灌入足够长的正文，页面本身仍然不该出现纵向滚动条
    await page.keyboard.press("Control+End");
    for (let index = 0; index < 40; index += 1) {
      await page.keyboard.type(`长文行 ${index}`);
      await page.keyboard.press("Enter");
    }

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollHeight - root.clientHeight;
    });
    expect(overflow).toBeLessThanOrEqual(2);

    const scrollIsInner = await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('[data-testid="note-scroll"]');
      return scroll ? scroll.scrollHeight > scroll.clientHeight : false;
    });
    expect(scrollIsInner).toBe(true);

    await expectSaved(page);
  });

  test("离开笔记再回来继续编辑不会弹出冲突弹窗", async ({ page }) => {
    expect(noteUrl, "缺少可用的笔记").not.toBe("");
    await page.goto(noteUrl);
    await focusEditor(page);

    // 不等 debounce 到期就离开：卸载时的 keepalive 落盘会推进服务端版本，
    // 而前端拿不到新版本号——这正是「正常编辑却弹冲突」的来源
    await page.keyboard.type(`离开前 ${Date.now()}`);
    // 用顶栏的知识库切换器（客户端路由，保留 TanStack Query 缓存）回到画廊。
    // 侧栏里也有裸 `/notes` 链接，但切换器是编辑页顶栏里语义最明确的那一个。
    // 编辑器（`/notes/:baseId/:noteId`）是满幅路由、**不在** `isKnowledgeBaseTabRoute`
    // 之内，所以它仍然保留顶栏与切换器。
    await page.getByTestId("kb-switcher").click();
    await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });

    // 走客户端路由回到同一篇笔记（保留 TanStack Query 缓存，才能复现旧版的过期版本号）
    await page
      .getByRole("link", { name: new RegExp(BASE_NAME) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/notes\/\d+$/, { timeout: 30_000 });
    await page.getByText(NOTE_TITLE).first().click();
    await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });

    await focusEditor(page);
    await page.keyboard.type(` 回来继续写 ${Date.now()}`);

    await expectSaved(page);
    await expect(page.getByText(CONFLICT_TITLE)).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "内容有冲突" })).toHaveCount(0);
  });

  test("连续多轮编辑都能落盘，不会卡在待保存", async ({ page }) => {
    await page.goto(noteUrl);
    await focusEditor(page);

    for (let round = 0; round < 3; round += 1) {
      await page.keyboard.type(` 第${round}轮`);
      await expectSaved(page);
    }
    await expect(page.getByText(CONFLICT_TITLE)).toHaveCount(0);
  });
});

test.describe("笔记编辑器：代码块", () => {
  /**
   * 回归：代码块在浅色与深色下都"没有底色、没有边框、没有圆角"。
   *
   * 根因是 `tiptap.css` 用了 shadcn v3 的变量名（`--muted` / `--border` /
   * `--radius`），而本套设计系统从未定义过它们。CSS 对未定义的 `var()` 不报错、
   * 不回退，只让整条声明失效——三条声明一起作废，代码块退化成一段裸文字。
   *
   * 所以这里断言**计算样式真的落了值**。只看类名或 DOM 结构的话，这种静默失效
   * 照样能通过——它当初就是这么溜过全部测试的。
   */
  test("代码块在浅色与深色下都有底色、边框与圆角，且两态不同", async ({ page }) => {
    expect(noteUrl, "缺少可用的笔记").not.toBe("");
    await page.goto(noteUrl);
    await focusEditor(page);

    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("```ts");
    await page.keyboard.press("Enter");
    await page.keyboard.type("const answer = 42;");

    const block = page.locator(".anynote-code-block").first();
    await expect(block).toBeVisible({ timeout: 30_000 });

    const read = () =>
      block.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          borderWidth: style.borderTopWidth,
          radius: style.borderRadius,
        };
      });

    const light = await read();
    expect(light.background, "浅色下代码块没有底色").not.toBe("rgba(0, 0, 0, 0)");
    expect(light.borderWidth, "浅色下代码块没有边框").not.toBe("0px");
    expect(light.radius, "浅色下代码块没有圆角").not.toBe("0px");

    await setTheme(page, "深色");
    const dark = await read();
    expect(dark.background, "深色下代码块没有底色").not.toBe("rgba(0, 0, 0, 0)");
    expect(dark.borderWidth, "深色下代码块没有边框").not.toBe("0px");
    expect(dark.radius, "深色下代码块没有圆角").not.toBe("0px");
    // 两态取值不同才说明 Token 真的换了一组，而不是只定义了一态
    expect(dark.background).not.toBe(light.background);

    await setTheme(page, "浅色");
  });

  test("代码块有语法高亮，且正文本身可见（不是透明文字叠高亮层）", async ({ page }) => {
    expect(noteUrl, "缺少可用的笔记").not.toBe("");
    await page.goto(noteUrl);
    await focusEditor(page);

    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    // ``` + 语言 + 回车触发代码块输入规则
    await page.keyboard.type("```ts");
    await page.keyboard.press("Enter");
    await page.keyboard.type("const answer = 42;");

    const codeBlock = page.locator("pre.anynote-code-block__editor").first();
    await expect(codeBlock).toBeVisible({ timeout: 30_000 });
    await expect(codeBlock).toContainText("const answer = 42;");

    // 高亮以装饰形式贴在真正的正文上
    await expect(page.locator(".anynote-code-token").first()).toBeVisible({ timeout: 30_000 });

    const styles = await codeBlock.evaluate((element) => {
      const computed = getComputedStyle(element);
      const token = element.querySelector<HTMLElement>(".anynote-code-token");
      return {
        color: computed.color,
        whiteSpace: computed.whiteSpace,
        tokenColor: token ? getComputedStyle(token).color : null,
        // 旧实现靠绝对定位的高亮层，移除后不该再出现
        hasOverlay: element.parentElement?.querySelector(".anynote-code-block__preview") !== null,
      };
    });

    // 旧实现把可编辑层的文字设成 transparent，靠下面的高亮层显形
    expect(styles.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(styles.whiteSpace).toBe("pre-wrap");
    expect(styles.tokenColor).not.toBe(styles.color);
    expect(styles.hasOverlay).toBe(false);

    await expectSaved(page);
    await page.reload();
    // 刷新后代码块仍然是代码块（markdown 往返没丢语言），高亮照常
    await expect(page.locator("pre.anynote-code-block__editor").first()).toContainText(
      "const answer = 42;",
      { timeout: 30_000 },
    );
    await expect(page.locator(".anynote-code-token").first()).toBeVisible({ timeout: 30_000 });
  });

  test("行内代码有芯片底色且不带 prose 的反引号", async ({ page }) => {
    await page.goto(noteUrl);
    await focusEditor(page);

    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("行内 `inlineCode` 结束");

    const inline = page.locator(`${EDITOR_SURFACE} code`).first();
    await expect(inline).toBeVisible({ timeout: 30_000 });

    const style = await inline.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        before: getComputedStyle(element, "::before").content,
        after: getComputedStyle(element, "::after").content,
        background: computed.backgroundColor,
        radius: computed.borderRadius,
      };
    });

    // @tailwindcss/typography 曾给 code 加 `content: "\`"`。现在编辑器不再加载
    // prose（排版由 styles/tiptap.css 接管），这些伪元素不该存在——
    // 保留断言是因为"哪天有人把 prose 加回来"正是最可能的回归方式。
    expect(style.before).not.toContain("`");
    expect(style.after).not.toContain("`");

    // 行内代码要有芯片样子：浅底 + 圆角。全透明说明 --surface-block 没生效
    // （未定义的 var() 会让整条 background-color 失效，且不报错）
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.radius).not.toBe("0px");
  });
});
