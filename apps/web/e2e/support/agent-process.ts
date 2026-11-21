import { randomBytes } from "node:crypto";
import { type APIRequestContext, type Page, expect, test } from "@playwright/test";
import type { ChatSession } from "../../src/features/ai/use-chat-stream";

type StreamWindow = Window & {
  __anynoteChatStreamStore?: { getState: () => { sessions: Record<string, ChatSession> } };
};

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/** 脚本化供应商三轮输出的思考全文，与 `tmp/m17-repair-check/scripted_provider.py` 一致。 */
const REASONING = [
  "先看看本次可以检索哪些知识库，再决定从哪里找答案。",
  "知识库列表已经拿到，在这个库里检索一下相关内容。",
  "列表里的知识库足够回答，据此作答并标注引用。",
];
const SEARCH_QUERY = "M17过程展示";
const COMPLETED_HEAD = /^已完成，用时 \d+ 秒 · 首字 \d+\.\d 秒 · 工具调用 2 次 · 检索 1 次$/;
const PROMPT = "M17PROCESS 本次可以检索几个知识库？";

/**
 * 调用真实 BFF 并校验业务信封。
 *
 * @param request Playwright 请求上下文
 * @param method HTTP 方法
 * @param path BFF 路径
 * @param data 请求体
 * @returns 业务数据
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

/**
 * 读取本次提问所在的会话。
 *
 * @param page 页面
 * @returns 会话状态，没有时为 undefined
 *
 * @author 称霸幼儿园
 */
async function readSession(page: Page): Promise<ChatSession | undefined> {
  return page.evaluate((question) => {
    const sessions = (window as StreamWindow).__anynoteChatStreamStore?.getState().sessions ?? {};
    return Object.values(sessions).find((item) => item.messages.at(-2)?.content === question);
  }, PROMPT);
}

/**
 * 断言流式进行中的过程区：桌面展开全部行，移动端只显示最新一行。
 *
 * @param page 页面
 * @param mobile 是否移动端
 *
 * @author 称霸幼儿园
 */
async function expectStreamingProcess(page: Page, mobile: boolean) {
  await page.waitForFunction(
    ({ question, latestOnly }) => {
      const sessions = (window as StreamWindow).__anynoteChatStreamStore?.getState().sessions ?? {};
      const session = Object.values(sessions).find(
        (item) => item.messages.at(-2)?.content === question,
      );
      const message = session?.messages.at(-1);
      if (!message?.streaming || (message.process?.items.length ?? 0) < 3) return false;
      const area = document.querySelector('[data-testid="process-area"]');
      const head = area?.querySelector('[data-testid="process-toggle"]')?.textContent ?? "";
      const rows = area?.querySelectorAll("li[data-testid^='process-']").length ?? 0;
      return head.startsWith("思考中 · ") && (latestOnly ? rows === 1 : rows >= 3);
    },
    { question: PROMPT, latestOnly: mobile },
    { timeout: 30_000 },
  );
}

/**
 * 展开过程区并断言思考行、工具行与结果条目链接。
 *
 * @param page 页面
 * @param mobile 是否移动端
 * @param kbId 知识库标识
 * @param kbName 知识库名称
 *
 * @author 称霸幼儿园
 */
async function expectExpandedProcess(page: Page, mobile: boolean, kbId: number, kbName: string) {
  const area = page.getByTestId("process-area");
  await expect(area.getByTestId("process-tool")).toHaveCount(0);
  await area.getByTestId("process-toggle").click();
  const reasoning = area.getByTestId("process-reasoning");
  await expect(reasoning).toHaveCount(REASONING.length);
  for (const [index, text] of REASONING.entries()) {
    await expect(reasoning.nth(index).locator("button > span").last()).toHaveText(text);
  }
  const tools = area.getByTestId("process-tool");
  await expect(tools).toHaveCount(2);
  await expect(tools.nth(0)).toContainText("列出可访问的知识库");
  await expect(tools.nth(0).getByTestId("process-tool-trailing")).toHaveText(
    /^1 个知识库 · \d+\.\d 秒$/,
  );
  await expect(tools.nth(1)).toContainText(`检索知识库· ${SEARCH_QUERY} · ${kbName}`);
  await expect(tools.nth(1).getByTestId("process-tool-trailing")).toHaveText(
    /^命中 0 条 · \d+\.\d 秒$/,
  );
  await tools.nth(0).locator("button").click();
  await expect(tools.nth(0).getByTestId("process-tool-item-link")).toHaveAttribute(
    "href",
    mobile ? `/m/notes/${kbId}` : `/notes/${kbId}/overview`,
  );
}

/**
 * 注册桌面或移动端的运行过程展示用例。
 *
 * @param mobile 是否移动端
 *
 * @author 称霸幼儿园
 */
export function agentProcessTests(mobile: boolean) {
  test.describe("M17 运行过程展示", () => {
    test.skip(process.env.E2E_AGENT_PROCESS !== "1", "需显式启用并配置本机脚本化供应商");
    let kbId: number;
    let kbName: string;
    let conversationId: number | null = null;
    test.beforeAll(async ({ request }) => {
      kbName = `M17过程-${randomBytes(4).toString("hex")}`;
      const base = await api(request, "POST", "/api/proxy/note/bases", {
        name: kbName,
        detail: "M17 运行过程展示验收",
        type: 0,
        cover: "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png",
      });
      kbId = base.id;
    });
    test.afterAll(async ({ request }) => {
      if (conversationId !== null) {
        await api(request, "DELETE", `/api/proxy/ai/chat/conversations/${conversationId}`);
      }
      if (kbId) await api(request, "DELETE", `/api/proxy/note/bases/${kbId}`);
    });

    /** 思考增量与工具行流式展示，完成后收起为一行，刷新后按落库过程视图回放。 */
    test("流式展示思考与工具行，完成后收起，重新进入会话后回放一致", async ({ page }, testInfo) => {
      await page.goto(mobile ? `/m/ai/chat/new?baseId=${kbId}` : `/ai/chat?baseId=${kbId}`);
      const response = page.waitForResponse(
        (item) => item.request().method() === "POST" && item.url().includes("/v1/agent/runs"),
      );
      await page.getByTestId("chat-input").fill(PROMPT);
      await page.getByRole("button", { name: "发送", exact: true }).click();
      const stream = await response;
      expect(stream.status()).toBe(200);
      expect(stream.headers()["content-type"]).toContain("text/event-stream");

      await expectStreamingProcess(page, mobile);
      await page.screenshot({ path: testInfo.outputPath("process-streaming.png") });

      await expect
        .poll(async () => (await readSession(page))?.messages.at(-1)?.outcome, {
          timeout: 60_000,
        })
        .toBe("ANSWERED");
      const session = await readSession(page);
      expect(session?.error).toBeNull();
      const message = session?.messages.at(-1);
      expect(message?.toolCalls).toBe(2);
      expect(typeof message?.firstOutputMs).toBe("number");
      conversationId = session?.conversationId ?? null;
      expect(conversationId).not.toBeNull();

      const toggle = page.getByTestId("process-toggle");
      await expect(toggle).toHaveText(COMPLETED_HEAD);
      const head = (await toggle.textContent()) ?? "";
      await expect(page.getByTestId("process-announcer")).toHaveText(head);
      await expectExpandedProcess(page, mobile, kbId, kbName);
      await page.screenshot({ path: testInfo.outputPath("process-completed.png"), fullPage: true });

      await page.goto(mobile ? `/m/ai/chat/${conversationId}` : `/ai/chat/${conversationId}`);
      await expect(page.getByTestId("process-toggle")).toHaveText(head);
      await expect(page.getByTestId("process-hidden-notice")).toHaveCount(0);
      await expectExpandedProcess(page, mobile, kbId, kbName);
      await page.screenshot({ path: testInfo.outputPath("process-replay.png"), fullPage: true });
    });
  });
}
