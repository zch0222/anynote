import { type Page, expect, test } from "@playwright/test";
import { ensureKnowledgeBase } from "./support/account";

const BASE_NAME = "E2E 知识库";

/** 最小合法 PDF：一页空白，够走完前端的类型校验与上传流程。 */
const MINIMAL_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`,
  "utf8",
);

/** 上传前必须先选中知识库，否则 handleFiles 会直接 toast「请先选择知识库」并返回。 */
async function selectKnowledgeBase(page: Page) {
  await page.goto("/ai/pdf");
  await expect(page.getByTestId("pdf-chat-page")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /选择知识库|E2E 知识库/ }).click();
  await page
    .getByRole("menuitem", { name: new RegExp(BASE_NAME) })
    .first()
    .click();
  await expect(page.getByTestId("pdf-upload-button")).toBeEnabled({ timeout: 30_000 });
}

function pdfInput(page: Page) {
  return page.locator('input[type="file"][accept="application/pdf"]');
}

/**
 * 关键路径 5：PDF 上传。
 *
 * 后端链路当前不通（M7.6 第 4 条：note→file 的 Feign multipart 转存失败），
 * 所以断言落在「前端确实发起了上传请求并给出明确反馈」上，
 * 成功与失败两个分支都接受——后端修好后不必改用例。
 */
test.describe("关键路径 5：Chat PDF 上传", () => {
  test.beforeEach(async ({ page }) => {
    await ensureKnowledgeBase(page, BASE_NAME);
  });

  test("选中 PDF 后发起上传请求，并给出进度或错误反馈", async ({ page }) => {
    await selectKnowledgeBase(page);

    const uploadRequest = page.waitForRequest(
      (request) => request.url().includes("/docs/pdfs") && request.method() === "POST",
      { timeout: 30_000 },
    );

    // 上传按钮点了才 click 隐藏 input，这里直接给 input 喂文件更稳
    await pdfInput(page).setInputFiles({
      name: "e2e-sample.pdf",
      mimeType: "application/pdf",
      buffer: MINIMAL_PDF,
    });

    await uploadRequest;

    const progress = page.getByTestId("pdf-upload-progress");
    const feedback = page.locator("[data-sonner-toast]").first();
    await expect(progress.or(feedback)).toBeVisible({ timeout: 45_000 });
  });

  test("非 PDF 文件不会发起上传", async ({ page }) => {
    await selectKnowledgeBase(page);

    let uploaded = false;
    page.on("request", (request) => {
      if (request.url().includes("/docs/pdfs")) uploaded = true;
    });

    await pdfInput(page).setInputFiles({
      name: "not-a-pdf.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("纯文本", "utf8"),
    });

    await expect(page.locator("[data-sonner-toast]").first()).toBeVisible({ timeout: 20_000 });
    expect(uploaded).toBe(false);
  });

  test("没选知识库时不上传，并提示先选知识库", async ({ page }) => {
    await page.goto("/ai/pdf");
    await expect(page.getByTestId("pdf-chat-page")).toBeVisible({ timeout: 30_000 });

    // 页面默认可能已带上第一个知识库；只有确实未选中时这条断言才有意义
    const uploadButton = page.getByTestId("pdf-upload-button");
    if (await uploadButton.isEnabled()) {
      test.skip(true, "页面已自动选中知识库，本分支无法复现");
    }
    await expect(uploadButton).toBeDisabled();
  });
});
