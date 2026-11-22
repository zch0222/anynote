import { randomBytes } from "node:crypto";
import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import type { ChatSession } from "../../src/features/ai/use-chat-stream";

type Fixture = {
  baseId: number;
  baseName: string;
  emptyBaseId: number;
  emptyBaseName: string;
  noteId: number;
  docId: number;
};
type StreamWindow = Window & {
  __anynoteChatStreamStore?: { getState: () => { sessions: Record<string, ChatSession> } };
};

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * 调用真实 BFF 并校验业务信封。
 *
 * @author 称霸幼儿园
 */
async function api(request: APIRequestContext, method: string, path: string, data?: unknown) {
  const response = await request.fetch(path, {
    method,
    headers: { origin: baseURL },
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.json();
  expect(body.code, `${method} ${path}`).toBe("00000");
  return body.data;
}

/** 生成第一页空白、第二页含可检索文本的合法 PDF。 */
function twoPagePdf(): Buffer {
  const text =
    "BT /F1 20 Tf 36 750 Td (M167PDFSECONDPAGE) Tj ET\nBT /F1 12 Tf 36 700 Td (Inverted indexes map terms to documents.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length 0 >>\nstream\n\nendstream",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  return Buffer.from(
    `${output}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
}

/** 经公开 API 创建本轮语料，并等待真实索引可检索。 */
async function seed(request: APIRequestContext): Promise<Fixture> {
  const suffix = randomBytes(4).toString("hex");
  const createBase = (name: string) =>
    api(request, "POST", "/api/proxy/note/bases", {
      name,
      detail: "M16.7 前端验收",
      type: 0,
      cover: "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png",
    });
  const baseName = `M167-${suffix}`;
  const base = await createBase(baseName);
  const emptyBaseName = `M167空库-${suffix}`;
  const empty = await createBase(emptyBaseName);
  const noteId = await api(request, "POST", "/api/proxy/note/notes", {
    knowledgeBaseId: base.id,
    title: "M167检索笔记",
  });
  await api(request, "PATCH", `/api/proxy/note/notes/${noteId}`, {
    content: `# M167检索笔记\n\n${"前置段落，仅用于检查长文定位。\n\n".repeat(40)}## 倒排索引\nM167NOTECITATION 倒排索引将词项映射到文档。`,
  });
  const uploaded = await request.post(
    `/api/proxy/note/docs/pdfs?knowledgeBaseId=${base.id}&uploadId=m167-${suffix}`,
    {
      headers: { origin: baseURL },
      multipart: {
        pdf: { name: "m167-two-pages.pdf", mimeType: "application/pdf", buffer: twoPagePdf() },
      },
    },
  );
  const upload = await uploaded.json();
  expect(upload.code).toBe("00000");
  const docId = upload.data.id;
  await api(request, "POST", `/api/proxy/note/docs/${docId}/index`);
  for (const ref of [`note:${noteId}`, `doc:${docId}`]) {
    await expect
      .poll(
        async () => {
          const response = await request.post(
            `${process.env.E2E_ES_URL ?? "http://localhost:9200"}/kn_chunk/_count`,
            {
              data: {
                query: { bool: { filter: [{ term: { ref } }, { term: { readable: true } }] } },
              },
            },
          );
          return (await response.json()).count ?? 0;
        },
        { timeout: 60_000, intervals: [500, 1000] },
      )
      .toBeGreaterThan(0);
  }
  return { baseId: base.id, baseName, emptyBaseId: empty.id, emptyBaseName, noteId, docId };
}

/** 在页面提交问题并等待真实运行完成。 */
async function ask(page: Page, prompt: string, pdf = false) {
  const response = page.waitForResponse(
    (item) =>
      item.request().method() === "POST" &&
      item.url().includes(pdf ? "/rag/query/docs/v1" : "/v1/agent/runs"),
  );
  await page.getByTestId("chat-input").fill(prompt);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  const stream = await response;
  expect(stream.status()).toBe(200);
  expect(stream.headers()["content-type"]).toContain("text/event-stream");
  await page.waitForFunction((question) => {
    const sessions = (window as StreamWindow).__anynoteChatStreamStore?.getState().sessions ?? {};
    return Object.values(sessions).some(
      (session) =>
        session.messages.at(-2)?.content === question &&
        (session.messages.at(-1)?.outcome || session.status === "error"),
    );
  }, prompt);
  const session = await page.evaluate((question) => {
    const sessions = (window as StreamWindow).__anynoteChatStreamStore?.getState().sessions ?? {};
    return Object.values(sessions).find((item) => item.messages.at(-2)?.content === question);
  }, prompt);
  expect(session?.error).toBeNull();
  const message = session?.messages.at(-1);
  if (!message) throw new Error("运行没有返回助手消息");
  return { message, request: stream.request().postDataJSON() };
}

/** 注册桌面或移动端的知识问答闭环用例。 */
export function agentRetrievalTests(mobile: boolean) {
  test.describe("M16.7 知识检索前端", () => {
    test.skip(process.env.E2E_AGENT_RETRIEVAL !== "1", "需显式启用并配置本机脚本化供应商");
    let fixture: Fixture;
    test.beforeAll(async ({ request }) => {
      fixture = await seed(request);
    });
    test.afterAll(async ({ request }) => {
      if (!fixture) return;
      await api(request, "DELETE", `/api/proxy/note/docs/${fixture.docId}`);
      await api(request, "DELETE", `/api/proxy/note/notes/${fixture.noteId}`);
      await api(request, "DELETE", `/api/proxy/note/bases/${fixture.baseId}`);
      await api(request, "DELETE", `/api/proxy/note/bases/${fixture.emptyBaseId}`);
    });

    /** 带引用回答、范围持久化与侧栏笔记小节定位。 */
    test("知识库入口问答带引用，刷新后恢复范围并在侧栏定位笔记小节", async ({ page }, testInfo) => {
      await page.goto(mobile ? `/m/notes/${fixture.baseId}` : `/notes/${fixture.baseId}`);
      await page.getByTestId(mobile ? "mobile-kb-ask-link" : "kb-ask-link").click();
      await expect(page.getByRole("combobox", { name: "检索范围" })).toHaveText(fixture.baseName);
      const { message, request } = await ask(page, "M167NOTECITATION 倒排索引是什么？");
      expect(request.scope).toEqual({ knowledgeBaseIds: [fixture.baseId], refs: [] });
      expect(message.outcome).toBe("ANSWERED");
      await expect(page.getByTestId("citation-list")).toBeVisible();
      await page.reload();
      await expect(page.getByRole("combobox", { name: "检索范围" })).toHaveText(fixture.baseName);
      const inline = page.locator(".anynote-editor__content a").filter({ hasText: "[1]" });
      await expect(inline).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("citation-answer.png"), fullPage: true });

      await inline.click();
      const panel = page.getByTestId(mobile ? "side-panel-mobile" : "side-panel");
      await expect(panel).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${mobile ? "/m" : ""}/ai/chat`));
      await expect(panel.getByRole("heading", { name: "倒排索引", exact: true })).toBeInViewport();

      // 修饰键点击仍是浏览器原生新标签页，地址回到完整页面
      if (mobile) await page.getByRole("button", { name: "关闭" }).click();
      const popupPromise = page.context().waitForEvent("page");
      await inline.click({ modifiers: ["Control"] });
      const popup = await popupPromise;
      await popup.waitForLoadState();
      await expect(popup).toHaveURL(
        new RegExp(`${mobile ? "/m" : ""}/notes/${fixture.baseId}/${fixture.noteId}\\?section=`),
      );
      await popup.close();
    });

    /** 桌面侧栏：同一资源只开一个标签，刷新后恢复标签与展开状态。 */
    test("右侧栏同一资源去重并在刷新后恢复", async ({ page }) => {
      test.skip(mobile, "桌面侧栏用例");
      await page.goto(`/ai/chat?baseId=${fixture.baseId}`);
      await page.evaluate(() => {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith("anynote-ai-side-panel:")) localStorage.removeItem(key);
        }
      });
      await page.reload();
      await ask(page, "M167NOTECITATION 倒排索引是什么？");
      const inline = page.locator(".anynote-editor__content a").filter({ hasText: "[1]" });
      await inline.click();
      const panel = page.getByTestId("side-panel");
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("tab")).toHaveCount(1);
      await inline.click();
      await expect(panel.getByRole("tab")).toHaveCount(1);

      await page.reload();
      await expect(page.getByTestId("side-panel")).toBeVisible();
      await expect(page.getByTestId("side-panel").getByRole("tab")).toHaveCount(1);
    });

    /** 桌面 1280 收起会话列表、1024 改为覆盖呈现。 */
    test("右侧栏在 1280 与 1024 宽度下的布局", async ({ page }) => {
      test.skip(mobile, "桌面布局用例");
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(`/ai/chat?baseId=${fixture.baseId}`);
      await ask(page, "M167NOTECITATION 倒排索引是什么？");
      const inline = page.locator(".anynote-editor__content a").filter({ hasText: "[1]" });
      await inline.click();
      const panel = page.getByTestId("side-panel");
      await expect(panel).toBeVisible();
      await expect(page.locator('aside:not([aria-label="右侧栏"])')).toBeHidden();

      await page.setViewportSize({ width: 1024, height: 720 });
      await expect(panel).toHaveClass(/absolute/);
      await expect(page.locator('aside:not([aria-label="右侧栏"])')).toBeVisible();
    });

    /** 空知识库必须返回明确的未找到结果。 */
    test("没有证据时显示未找到与已查询范围", async ({ page }) => {
      await page.goto(
        mobile
          ? `/m/ai/chat/new?baseId=${fixture.emptyBaseId}`
          : `/ai/chat?baseId=${fixture.emptyBaseId}`,
      );
      const { message } = await ask(page, "M167ABSENT 不存在的内容是什么？");
      expect(message.outcome).toBe("NOT_FOUND");
      await expect(
        page.getByText(`未找到相关内容。已查询范围：${fixture.emptyBaseName}`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("citation-list")).toHaveCount(0);
    });

    /** PDF 走单资料端点，引用点击定位到第二页。 */
    test("PDF 问答使用新端点并定位引用页", async ({ page }, testInfo) => {
      await page.goto(
        mobile
          ? `/m/ai/pdf/${fixture.docId}`
          : `/ai/pdf?baseId=${fixture.baseId}&docId=${fixture.docId}`,
      );
      if (mobile) await page.getByRole("tab", { name: "问答", exact: true }).click();
      const { message, request } = await ask(page, "M167PDFSECONDPAGE inverted indexes", true);
      expect(request.docId).toBe(fixture.docId);
      expect(message.outcome).toBe("ANSWERED");
      const citation = message.citations?.[0];
      expect(citation?.sourceId).toBe(`doc:${fixture.docId}`);
      expect(citation?.locator?.pageStart).toBe(2);
      await page.getByRole("link", { name: `查看引用 ${citation?.index}`, exact: true }).click();
      await expect(page.locator('[data-pdf-page="2"] canvas')).toBeVisible({ timeout: 30_000 });
      if (mobile)
        await expect(page.getByRole("tab", { name: "问答", exact: true })).toBeInViewport();
      await expect
        .poll(async () => {
          const container = page.getByTestId("pdf-viewer");
          const offset = await container.evaluate((element) => element.scrollTop);
          return offset;
        })
        .toBeGreaterThan(100);
      await page.screenshot({ path: testInfo.outputPath("pdf-citation.png") });
    });
  });
}
