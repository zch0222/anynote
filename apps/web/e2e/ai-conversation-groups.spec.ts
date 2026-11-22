import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { readAccount } from "./support/account";
import { setTheme } from "./support/theme";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MYSQL_CONTAINER = process.env.E2E_MYSQL_CONTAINER ?? "anynote-mysql";
const DEFAULT_COVER =
  "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png";

/**
 * 调用真实 BFF 并返回业务数据。
 *
 * @param request Playwright 请求上下文
 * @param method HTTP 方法
 * @param path BFF 路径
 * @param data 请求体
 * @returns 业务数据
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

function hex(value: string): string {
  return `0x${Buffer.from(value, "utf8").toString("hex")}`;
}

/**
 * 通过本机 MySQL 容器执行一条 SQL，SQL 作为容器内命令参数传递。
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
      "anynote-e2e",
      sql,
    ],
    { stdio: "pipe", encoding: "utf8" },
  ).trim();
}

/**
 * 桌面 AI 会话知识库分组真实栈验收。
 *
 * @author 称霸幼儿园
 */
test.describe("AI 会话知识库分组", () => {
  const suffix = randomBytes(4).toString("hex");
  const firstBaseName = `AI分组一-${suffix}`;
  const secondBaseName = `AI分组二-${suffix}`;
  let firstBaseId = 0;
  let secondBaseId = 0;
  let userId = 0;
  let firstBaseTitles: string[] = [];

  test.beforeAll(async ({ request }) => {
    const firstBase = await api(request, "POST", "/api/proxy/note/bases", {
      name: firstBaseName,
      detail: "AI 会话分组 E2E 临时知识库",
      type: 0,
      cover: DEFAULT_COVER,
    });
    firstBaseId = firstBase.id;
    const secondBase = await api(request, "POST", "/api/proxy/note/bases", {
      name: secondBaseName,
      detail: "AI 会话分组 E2E 临时知识库",
      type: 0,
      cover: DEFAULT_COVER,
    });
    secondBaseId = secondBase.id;

    const usernameHex = Buffer.from(readAccount().username, "utf8").toString("hex");
    userId = Number(mysql(`SELECT id FROM sys_user WHERE username = 0x${usernameHex}`));
    expect(Number.isSafeInteger(userId) && userId > 0).toBe(true);

    firstBaseTitles = Array.from(
      { length: 7 },
      (_, index) => `AI分组会话-${suffix}-${String(index + 1).padStart(2, "0")}`,
    );
    const rows = [
      ...firstBaseTitles.map((title) => ({
        title,
        scope: { knowledgeBaseIds: [firstBaseId], refs: [] },
      })),
      {
        title: `AI分组二会话-${suffix}`,
        scope: { knowledgeBaseIds: [secondBaseId], refs: [] },
      },
      {
        title: `AI多库会话-${suffix}`,
        scope: { knowledgeBaseIds: [firstBaseId, secondBaseId], refs: [] },
      },
      { title: `AI全库会话-${suffix}`, scope: { knowledgeBaseIds: [], refs: [] } },
    ];
    const values = rows
      .map((row, index) => {
        const scope = JSON.stringify(row.scope);
        const timestamp = `DATE_SUB(NOW(), INTERVAL ${index} SECOND)`;
        return `(${hex(row.title)}, 2, '${scope}', ${userId}, ${timestamp}, ${userId}, ${timestamp})`;
      })
      .join(",");
    mysql(
      `INSERT INTO a_chat_conversation (title, type, scope, create_by, create_time, update_by, update_time) VALUES ${values}`,
    );
  });

  test.afterAll(async ({ request }) => {
    if (userId > 0) mysql(`DELETE FROM a_chat_conversation WHERE create_by = ${userId}`);
    for (const baseId of [firstBaseId, secondBaseId]) {
      if (baseId > 0) await api(request, "DELETE", `/api/proxy/note/bases/${baseId}`);
    }
  });

  /** 真实会话按范围分组，支持组内增量展开、折叠和打开会话。 */
  test("分组、显示更多、折叠和打开会话", async ({ page }, testInfo) => {
    await page.goto("/ai/chat");
    const navigation = page.getByRole("navigation", { name: "会话列表" });
    await expect(page.getByText("对话列表", { exact: true })).toBeVisible();
    const sections = navigation.locator("section[data-group-key]");
    await expect(sections).toHaveCount(4);
    const groupKeys = await sections.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-group-key")),
    );
    expect(groupKeys.slice(0, 2).sort()).toEqual(
      [`kb:${firstBaseId}`, `kb:${secondBaseId}`].sort(),
    );
    expect(groupKeys.slice(-2)).toEqual(["other", "all"]);

    const firstGroup = navigation.locator(`section[data-group-key="kb:${firstBaseId}"]`);
    const conversationRows = firstGroup.locator('[data-testid^="conversation-item-"]');
    await expect(conversationRows).toHaveCount(5);
    await firstGroup.getByRole("button", { name: "显示更多", exact: true }).click();
    await expect(conversationRows).toHaveCount(7);
    await firstGroup.getByRole("button", { name: "收起", exact: true }).click();
    await expect(conversationRows).toHaveCount(5);

    const firstToggle = firstGroup.getByRole("button", { name: firstBaseName, exact: true });
    await firstToggle.click();
    await expect(firstToggle).toHaveAttribute("aria-expanded", "false");
    await expect(conversationRows).toHaveCount(0);
    await firstToggle.click();
    await expect(conversationRows).toHaveCount(5);

    await setTheme(page, "深色");
    await page.screenshot({
      path: testInfo.outputPath("conversation-groups-dark.png"),
      fullPage: true,
    });
    await conversationRows.first().getByRole("button").first().click();
    await expect(page).toHaveURL(/\/ai\/chat\/\d+$/);
  });
});
