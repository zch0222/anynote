import { type Page, expect, test } from "@playwright/test";
import { ensureKnowledgeBase } from "./support/account";

const BASE_NAME = "E2E 知识库";
const NOTE_TITLE = `E2E 笔记 ${Date.now().toString().slice(-6)}`;

// 第二条用例直接复用第一条创建出来的笔记地址：serial 模式下同一个 worker，
// 模块级变量能传下去，比再从列表里点一遍稳得多。
let noteUrl = "";

const EDITOR_SURFACE = ".anynote-editor__content";
const CONFLICT_TITLE = "这篇笔记已被其他会话修改";

/** 等编辑器可交互；正文是 dynamic 懒加载的，直接点会点空。 */
async function focusEditor(page: Page) {
  const surface = page.locator(EDITOR_SURFACE);
  await expect(surface).toBeVisible({ timeout: 30_000 });
  await surface.click();
  return surface;
}

async function expectSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("关键路径 2/3：创建笔记与编辑保存", () => {
  test("创建笔记后跳进编辑器", async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);

    await page.goto("/notes/new");
    await page.getByLabel("标题").fill(NOTE_TITLE);
    await page.getByRole("button", { name: "创建笔记" }).click();

    // 创建成功会跳到 /notes/<baseId>/<noteId>
    await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });
    await expect(page.getByLabel("笔记标题")).toHaveValue(NOTE_TITLE, { timeout: 30_000 });
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

test.describe("笔记编辑器：布局与保存冲突", () => {
  test("编辑区占满视口高度，长文在编辑器内部滚动而不是顶长整页", async ({ page }) => {
    expect(noteUrl, "缺少可用的笔记").not.toBe("");
    await page.goto(noteUrl);
    await focusEditor(page);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const editorBox = await page.locator(".anynote-editor").first().boundingBox();
    expect(editorBox).not.toBeNull();
    // 编辑器要吃掉页头之外的绝大部分高度，而不是缩成固定的 320px 内容框
    expect(editorBox?.height ?? 0).toBeGreaterThan((viewport?.height ?? 0) * 0.6);

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

    const surfaceScrollable = await page.evaluate((selector) => {
      const surface = document.querySelector(selector)?.parentElement;
      return surface ? surface.scrollHeight > surface.clientHeight : false;
    }, EDITOR_SURFACE);
    expect(surfaceScrollable).toBe(true);

    await expectSaved(page);
  });

  test("离开笔记再回来继续编辑不会弹出冲突弹窗", async ({ page }) => {
    expect(noteUrl, "缺少可用的笔记").not.toBe("");
    await page.goto(noteUrl);
    await focusEditor(page);

    // 不等 debounce 到期就离开：卸载时的 keepalive 落盘会推进服务端版本，
    // 而前端拿不到新版本号——这正是「正常编辑却弹冲突」的来源
    await page.keyboard.type(`离开前 ${Date.now()}`);
    // 用面包屑而不是侧边栏：两处都有「笔记」链接，这里要的是编辑页内的那一个
    await page
      .getByRole("navigation", { name: "面包屑" })
      .getByRole("link", { name: "笔记", exact: true })
      .click();
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

  test("行内代码不会被 prose 加上反引号", async ({ page }) => {
    await page.goto(noteUrl);
    await focusEditor(page);

    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("行内 `inlineCode` 结束");

    const inline = page.locator(`${EDITOR_SURFACE} code`).first();
    await expect(inline).toBeVisible({ timeout: 30_000 });

    const pseudo = await inline.evaluate((element) => ({
      before: getComputedStyle(element, "::before").content,
      after: getComputedStyle(element, "::after").content,
    }));
    // @tailwindcss/typography 默认给 code 加 `content: "\`"`，编辑器里必须复位
    expect(pseudo.before).not.toContain("`");
    expect(pseudo.after).not.toContain("`");
  });
});
