import { type Page, expect, test } from "@playwright/test";
import { ensureKnowledgeBase } from "./support/account";

/**
 * 关键路径：笔记正文图片上传（MINIO_PLAN M11.2 / M11.3）。
 *
 * 这条用例是整条 MinIO 链路的验收闸门，跑的是**生产构建 + 真实后端 + 真实 MinIO**：
 *   1. POST /api/note/notes/{id}/images/uploadTasks   （path / source 由服务端定）
 *   2. POST /api/file/getOssSliceUploadSignatures
 *   3. 浏览器按签名直接 PUT 分片到 MinIO（不过 BFF / Gateway）
 *   4. POST /api/file/markOssSliceUploadSignatures
 *   5. POST /api/file/composeOssSliceUploadObject
 *   6. 正文写入 /api/proxy/file/objects/{fileId}/redirect
 *
 * 断言 `naturalWidth > 0` 是关键：只有图片**真的被浏览器解码并渲染**，
 * 才同时证明"合并出的对象存在"、"redirect 302 指向的预签名 URL 可读"、
 * "BFF 透传了 Location 而没有自己 follow"。
 */

/** 1×1 的合法 PNG（67 字节），够走完分片与合并，且能被浏览器解码。 */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

async function createNote(page: Page, title: string): Promise<string> {
  await ensureKnowledgeBase(page, "E2E 图片上传");
  await page.goto("/notes/new");
  await page.getByLabel("标题").fill(title);
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });
  await expect(page.locator(".anynote-editor__content")).toBeVisible({ timeout: 30_000 });
  return new URL(page.url()).pathname;
}

/** 工具栏的图片入口：点击后插一个隐藏 input，直接把文件喂给它最稳。 */
async function uploadImageThroughToolbar(page: Page) {
  const chooser = page.waitForEvent("filechooser", { timeout: 30_000 });
  await page.getByRole("button", { name: /图片/ }).first().click();
  const fileChooser = await chooser;
  await fileChooser.setFiles({
    name: "e2e-pixel.png",
    mimeType: "image/png",
    buffer: ONE_PIXEL_PNG,
  });
}

/** 编辑器里的图片节点。 */
function insertedImage(page: Page) {
  return page.locator('.anynote-editor__content img[src^="/api/proxy/file/objects/"]');
}

test.describe("笔记图片：分片直传到 MinIO 并渲染", () => {
  test("工具栏上传后正文出现稳定地址的图片，且真的加载成功", async ({ page }) => {
    await createNote(page, "E2E 图片上传笔记");

    // 第 1 步必须打 note 的业务端点；file 的 /ossSliceUploadTasks 带 @InnerAuth 会被拒
    const createTask = page.waitForRequest(
      (request) =>
        /\/api\/proxy\/note\/notes\/\d+\/images\/uploadTasks$/.test(request.url()) &&
        request.method() === "POST",
      { timeout: 30_000 },
    );
    // 第 3 步是浏览器直接 PUT 到 MinIO（地址来自签名，不经 BFF）
    const putChunk = page.waitForRequest(
      (request) => request.method() === "PUT" && request.url().includes("X-Amz-Signature"),
      { timeout: 30_000 },
    );

    await uploadImageThroughToolbar(page);

    const taskRequest = await createTask;
    const body = taskRequest.postDataJSON() as Record<string, unknown>;
    // path / source 不允许由客户端提供：服务端按笔记归属拼装，否则可越权写他人目录
    expect(body).not.toHaveProperty("path");
    expect(body).not.toHaveProperty("source");
    // fileSize 单位是 MB：传字节会让 1MiB 图片被切成 1000 片，上传必败
    expect(typeof body.fileSize).toBe("number");
    expect(body.fileSize as number).toBeLessThan(1);
    expect(body.fileName).toBe("e2e-pixel.png");

    await putChunk;

    const image = insertedImage(page).first();
    await expect(image).toBeVisible({ timeout: 45_000 });

    // 稳定地址形如 /api/proxy/file/objects/{fileId}/redirect，不含会过期的签名参数
    const src = await image.getAttribute("src");
    expect(src).toMatch(/^\/api\/proxy\/file\/objects\/\d+\/redirect$/);
    expect(src).not.toContain("X-Amz-");

    // 真正解码成功：证明 redirect 的 302 被 BFF 透传、对象可读
    await expect
      .poll(async () => image.evaluate((element) => (element as HTMLImageElement).naturalWidth), {
        timeout: 45_000,
        message: "图片未加载成功：redirect 302 或 MinIO 预签名 URL 可能有问题",
      })
      .toBeGreaterThan(0);
  });

  test("刷新页面后图片仍在且能重新加载（地址确实不会过期）", async ({ page }) => {
    await createNote(page, "E2E 图片持久化笔记");
    await uploadImageThroughToolbar(page);

    const image = insertedImage(page).first();
    await expect
      .poll(async () => image.evaluate((element) => (element as HTMLImageElement).naturalWidth), {
        timeout: 45_000,
      })
      .toBeGreaterThan(0);

    // 等正文落盘，避免刷新时草稿还没保存
    await expect(page.getByRole("status").filter({ hasText: "已保存" })).toBeVisible({
      timeout: 30_000,
    });
    await page.reload();

    const reloaded = insertedImage(page).first();
    await expect(reloaded).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(
        async () => reloaded.evaluate((element) => (element as HTMLImageElement).naturalWidth),
        { timeout: 45_000, message: "刷新后图片加载失败：正文里可能存了会过期的预签名 URL" },
      )
      .toBeGreaterThan(0);
    // 正文里存的必须是稳定路径，而不是固化下来的 7 天预签名 URL
    expect(await reloaded.getAttribute("src")).toMatch(
      /^\/api\/proxy\/file\/objects\/\d+\/redirect$/,
    );
  });
});

/**
 * 上传过程必须有可见反馈（本次新增）。
 *
 * 上传本身很快（1×1 PNG 只有一个分片），指示器会在几十毫秒内消失，
 * 直接断言必然是 flaky 的。所以这里**人为拖慢第 1 步**（建上传任务）的响应，
 * 把那个瞬态窗口撑开——这正是用户在慢网络下的真实体感。
 */
test.describe("笔记图片：上传过程有 loading 提示", () => {
  test("上传期间显示「上传中」指示器，完成后被图片替换", async ({ page }) => {
    await createNote(page, "E2E 上传提示笔记");

    const indicator = page.locator('[data-testid="image-upload-indicator"]');

    // 建任务请求延迟 1.5s，让指示器有足够时间被观察到
    await page.route("**/images/uploadTasks", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await uploadImageThroughToolbar(page);

    // 上传途中：指示器可见，且明确写着"上传中"（不是静默等待）
    await expect(indicator).toBeVisible({ timeout: 30_000 });
    await expect(indicator).toContainText("上传中");

    // 完成之后：指示器消失，换成真正的图片
    await expect(indicator).toHaveCount(0, { timeout: 45_000 });
    await expect(insertedImage(page).first()).toBeVisible({ timeout: 45_000 });
  });

  test("上传失败时指示器被清理，不会永远转圈", async ({ page }) => {
    await createNote(page, "E2E 上传失败提示笔记");

    const indicator = page.locator('[data-testid="image-upload-indicator"]');

    // 让建任务直接失败（业务错误码 + HTTP 200，与后端真实错误形态一致）
    await page.route("**/images/uploadTasks", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: "B0001", msg: "模拟上传失败", data: null }),
      });
    });

    await uploadImageThroughToolbar(page);

    await expect(indicator).toBeVisible({ timeout: 30_000 });
    // 失败后必须收尾，否则正文里会留下一个永远转圈的占位
    await expect(indicator).toHaveCount(0, { timeout: 30_000 });
    await expect(insertedImage(page)).toHaveCount(0);
  });
});
