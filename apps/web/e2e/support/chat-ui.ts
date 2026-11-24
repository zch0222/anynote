import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { type APIRequestContext, type Page, type TestInfo, expect, test } from "@playwright/test";
import { readAccount } from "./account";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MYSQL_CONTAINER = process.env.E2E_MYSQL_CONTAINER ?? "anynote-mysql";
const PROMPT = "列一个表格列出所有内容";
const ANSWER = [
  "以下是本次内容：",
  "",
  "| 类型 | 标题 | 引用 | 最近更新 |",
  "| --- | --- | --- | --- |",
  "| 笔记 | UI 设计 | note:2579 | 2026-11-24 |",
  "| 资料（PDF） | DeepSeek Harness 风格参考 | doc:77 | 2026-11-24 |",
  "",
  "该知识库共 2 项内容。",
].join("\n");

/**
 * 调用真实 BFF 并校验业务信封。
 *
 * @param request Playwright 请求上下文
 * @param method HTTP 方法
 * @param path BFF 路径
 * @returns 业务数据
 * @author 称霸幼儿园
 */
async function api(request: APIRequestContext, method: string, path: string) {
  const response = await request.fetch(path, { method, headers: { origin: baseURL } });
  const body = await response.json();
  expect(body.code, `${method} ${path}`).toBe("00000");
  return body.data;
}

/**
 * 将文本转换为 MySQL 十六进制字面量。
 *
 * @param value 原始文本
 * @returns MySQL 十六进制字面量
 * @author 称霸幼儿园
 */
function hex(value: string): string {
  return `0x${Buffer.from(value, "utf8").toString("hex")}`;
}

/**
 * 通过本机 MySQL 容器执行 E2E 数据准备或清理 SQL。
 *
 * @param sql 待执行的 SQL
 * @returns 去掉表头的文本结果
 * @author 称霸幼儿园
 */
function mysql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      MYSQL_CONTAINER,
      "sh",
      "-c",
      'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" anynote -N -e "$1" 2>/dev/null',
      "anynote-chat-ui-e2e",
      sql,
    ],
    { stdio: "pipe", encoding: "utf8" },
  ).trim();
}

/**
 * 切换主题并重新加载当前会话，等待主题类生效。
 *
 * @param page 当前页面
 * @param theme 目标主题
 * @author 称霸幼儿园
 */
async function applyTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => window.localStorage.setItem("theme", value), theme);
  await page.reload();
  if (theme === "dark") {
    await expect(page.locator("html")).toHaveClass(/dark/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  }
  await expect(page.locator(".anynote-ai-message .tableWrapper")).toBeVisible();
}

/**
 * 检查消息表面与表格的视觉层级并保存实拍。
 *
 * @param page 当前页面
 * @param testInfo Playwright 用例信息
 * @param theme 当前主题
 * @param mobile 是否移动端
 * @author 称霸幼儿园
 */
async function expectMessageSurfaces(
  page: Page,
  testInfo: TestInfo,
  theme: "light" | "dark",
  mobile: boolean,
) {
  const message = page.locator(".anynote-ai-message");
  const table = message.locator(".tableWrapper");
  await expect(message).toBeVisible();
  await expect(table).toBeVisible();
  const backgrounds = await message.evaluate((element) => {
    const surface = getComputedStyle(element).backgroundColor;
    let parent = element.parentElement;
    while (parent) {
      const page = getComputedStyle(parent).backgroundColor;
      if (page !== "rgba(0, 0, 0, 0)" && page !== "transparent") {
        return { surface, page };
      }
      parent = parent.parentElement;
    }
    return { surface, page: null };
  });
  expect(backgrounds.page).not.toBeNull();
  expect(backgrounds.surface).not.toBe(backgrounds.page);
  const headerBackground = await table
    .locator("th")
    .first()
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(headerBackground).not.toBe(backgrounds.surface);
  expect(await table.evaluate((element) => getComputedStyle(element).borderTopStyle)).toBe("solid");
  expect(await table.evaluate((element) => getComputedStyle(element).overflowX)).toBe("auto");
  if (mobile) {
    const widths = await table.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(widths.scroll).toBeGreaterThan(widths.client);
  }
  await page.screenshot({ path: testInfo.outputPath(`chat-${theme}.png`), fullPage: true });
}

/**
 * 注册桌面或移动端 AI 对话 UI 的真实栈验收。
 *
 * @param mobile 是否使用移动端路由
 * @author 称霸幼儿园
 */
export function aiChatUiTests(mobile: boolean) {
  test.describe(mobile ? "移动端 AI 对话 UI" : "桌面 AI 对话 UI", () => {
    const title = `AI对话UI-${randomBytes(4).toString("hex")}`;
    let conversationId = 0;
    let deletedThroughUi = false;

    test.beforeAll(async ({ request }) => {
      const usernameHex = Buffer.from(readAccount().username, "utf8").toString("hex");
      const userId = Number(mysql(`SELECT id FROM sys_user WHERE username = 0x${usernameHex}`));
      expect(Number.isSafeInteger(userId) && userId > 0).toBe(true);
      mysql(
        `INSERT INTO a_chat_conversation (title, type, scope, create_by, create_time, update_by, update_time) VALUES (${hex(title)}, 2, '{\"knowledgeBaseIds\":[],\"refs\":[]}', ${userId}, NOW(), ${userId}, NOW())`,
      );
      conversationId = Number(
        mysql(
          `SELECT id FROM a_chat_conversation WHERE title = ${hex(title)} AND create_by = ${userId}`,
        ),
      );
      expect(conversationId).toBeGreaterThan(0);
      mysql(
        `INSERT INTO a_chat_message (conversation_id, order_index, content, outcome, role, type, create_by, create_time, update_by, update_time) VALUES (${conversationId}, 0, ${hex(PROMPT)}, NULL, 0, 2, ${userId}, NOW(), ${userId}, NOW()), (${conversationId}, 1, ${hex(ANSWER)}, 'ANSWERED', 1, 2, ${userId}, NOW(), ${userId}, NOW())`,
      );
    });

    test.afterAll(async ({ request }) => {
      if (conversationId > 0 && !deletedThroughUi) {
        await api(request, "DELETE", `/api/proxy/ai/chat/conversations/${conversationId}`);
      }
    });

    /** 消息与表格在两种主题下分层，复制原文并再次发送最后一问。 */
    test("消息卡片、表格、复制和重新提问", async ({ page }, testInfo) => {
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.goto(mobile ? `/m/ai/chat/${conversationId}` : `/ai/chat/${conversationId}`);
      await applyTheme(page, "light");
      await expectMessageSurfaces(page, testInfo, "light", mobile);
      await applyTheme(page, "dark");
      await expectMessageSurfaces(page, testInfo, "dark", mobile);

      const assistant = page.locator(".anynote-ai-message");
      await assistant.getByRole("button", { name: "复制", exact: true }).click();
      await expect(assistant.getByRole("button", { name: "已复制", exact: true })).toBeVisible();
      const copiedText = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiedText.replaceAll("\r\n", "\n")).toBe(ANSWER);

      if (!mobile) {
        await page.getByRole("button", { name: `重命名会话「${title}」` }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.getByRole("button", { name: "取消", exact: true }).click();
      }

      const requestPromise = page.waitForRequest(
        (request) =>
          request.method() === "POST" && request.url().includes("/api/proxy/ai/v1/agent/runs"),
      );
      await assistant.getByRole("button", { name: "重新提问", exact: true }).click();
      const request = await requestPromise;
      expect(request.postDataJSON()).toMatchObject({ input: PROMPT, conversationId });
      const stop = page.getByTestId("chat-stop");
      if (await stop.isVisible()) await stop.click();

      if (!mobile) {
        await page.goto("/ai/chat");
        const row = page.getByTestId(`conversation-item-${conversationId}`);
        await row.hover();
        page.once("dialog", (dialog) => void dialog.accept());
        await page.getByRole("button", { name: `删除会话「${title}」` }).click();
        await expect(row).toHaveCount(0);
        deletedThroughUi = true;
      }
    });
  });
}
