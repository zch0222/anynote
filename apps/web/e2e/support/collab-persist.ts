import { execSync } from "node:child_process";
import { type APIRequestContext, type Browser, type Page, expect } from "@playwright/test";
import { ensureKnowledgeBase } from "./account";

/**
 * 服务端落库（M14.5）端到端用例的公共工具：笔记读写、协同服务健康端点、本机 Docker 故障注入。
 *
 * 故障演练直接操作本机 Docker 容器，容器名可用环境变量覆盖。
 */

export const EDITOR_SURFACE = ".anynote-editor__content";
export const COLLAB_HEALTH = process.env.COLLAB_HEALTH_URL ?? "http://localhost:1234/healthz";
export const COLLAB_CONTAINER = process.env.E2E_COLLAB_CONTAINER ?? "anynote-anynote-collab-1";
export const NOTE_CONTAINER = process.env.E2E_NOTE_CONTAINER ?? "anynote-anynote-modules-note-1";
export const MYSQL_CONTAINER = process.env.E2E_MYSQL_CONTAINER ?? "anynote-mysql";

/** 断网后徽标转为离线的等待上限：y-websocket 的 30 秒无消息判定，加一个检查周期与余量。 */
export const OFFLINE_DETECT_MS = 45_000;

export type CollabHealth = {
  status: string;
  rooms: number;
  serverPersist: boolean;
  pendingStores?: number;
  failingRooms?: Array<{ room: string; failures: number; lastError: string | null }>;
};

export async function readHealth(request: APIRequestContext): Promise<CollabHealth> {
  const response = await request.get(COLLAB_HEALTH);
  return (await response.json()) as CollabHealth;
}

/** 等协同服务恢复可用（容器重启之后）。 */
export async function waitCollabHealthy(request: APIRequestContext, timeout = 60_000) {
  await expect
    .poll(
      async () => {
        try {
          return (await readHealth(request)).status;
        } catch {
          return "down";
        }
      },
      { timeout, intervals: [500, 1_000] },
    )
    .toBe("ok");
}

/** 等所有房间销毁（写库完成、无人在线）。 */
export async function waitRoomsClosed(request: APIRequestContext, timeout = 30_000) {
  await expect
    .poll(async () => (await readHealth(request)).rooms, { timeout, intervals: [500] })
    .toBe(0);
}

export function docker(args: string): string {
  return execSync(`docker ${args}`, { stdio: "pipe", encoding: "utf8" });
}

/** 在开发库上执行一条 SQL，返回去掉表头的文本结果。 */
export function mysql(sql: string): string {
  const escaped = sql.replace(/"/g, '\\"');
  return docker(
    `exec ${MYSQL_CONTAINER} sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" anynote -N -e "${escaped}" 2>/dev/null'`,
  ).trim();
}

export function notePath(noteId: number): string {
  return `/api/proxy/note/notes/${noteId}`;
}

export type NoteRecord = { title: string; content: string; updateTime: string };

export async function readNote(page: Page, noteId: number): Promise<NoteRecord> {
  const response = await page.request.get(notePath(noteId));
  const body = (await response.json()) as { code?: string; data?: NoteRecord };
  if (!body.data) throw new Error(`读取笔记 ${noteId} 失败：${JSON.stringify(body)}`);
  return body.data;
}

/** 按当前版本号写入，模拟 CLI `note set` 或历史恢复这类带 version 的外部写入。 */
export async function patchWithVersion(
  page: Page,
  noteId: number,
  body: { title?: string; content: string },
) {
  const current = await readNote(page, noteId);
  const version = String(new Date(current.updateTime).getTime());
  const response = await page.request.patch(notePath(noteId), {
    headers: { origin: new URL(page.url()).origin, "content-type": "application/json" },
    data: { ...body, version },
  });
  const result = (await response.json()) as { code: string };
  expect(result.code).toBe("00000");
}

/** 新建一篇笔记并停在编辑页，返回地址与 id。 */
export async function createNote(page: Page, baseName: string, title: string) {
  await ensureKnowledgeBase(page, baseName);
  await page.goto("/notes/new");
  await page.getByLabel("标题").fill(title);
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/notes\/\d+\/\d+/, { timeout: 30_000 });
  await expect(page.locator(`${EDITOR_SURFACE} h1`).first()).toHaveText(title, { timeout: 30_000 });
  const url = page.url();
  return { url, noteId: Number(new URL(url).pathname.split("/").pop()) };
}

/** 服务端落库模式下编辑器绑定到协同文档后才可写；等到可写再把光标放到正文最后一个字之后。 */
export async function focusEnd(page: Page) {
  const surface = page.locator(EDITOR_SURFACE).first();
  await expect(surface).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
  await surface.click();
  await surface.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    while (walker.nextNode()) last = walker.currentNode;
    const range = document.createRange();
    if (last) {
      range.setStart(last, last.textContent?.length ?? 0);
    } else {
      range.selectNodeContents(element.lastElementChild ?? element);
      range.collapse(false);
    }
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  // 等 ProseMirror 从 selectionchange 同步到新选区
  await page.waitForTimeout(100);
  return surface;
}

let collabBuild: Promise<boolean> | null = null;

/**
 * 当前 web 构建是否开启了笔记协同。
 *
 * `NEXT_PUBLIC_COLLAB_NOTES` 在构建期内联，测试进程读不到，所以按行为判断：
 * 新建一篇笔记（作者有编辑权），看编辑页会不会去换协同令牌。结果在测试进程内缓存。
 * 默认构建不开协同，只在协同模式下有意义的用例据此跳过。
 */
export function collabNotesEnabled(browser: Browser): Promise<boolean> {
  collabBuild ??= (async () => {
    const context = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      storageState: "./e2e/.auth/state.json",
    });
    try {
      const page = await context.newPage();
      let requested = false;
      page.on("request", (request) => {
        if (request.url().includes("/api/auth/collab-token")) requested = true;
      });
      await createNote(page, "E2E 协同探测库", `协同探测 ${Date.now().toString().slice(-6)}`);
      if (requested) return true;
      return await page
        .waitForRequest((request) => request.url().includes("/api/auth/collab-token"), {
          timeout: 5_000,
        })
        .then(
          () => true,
          () => false,
        );
    } finally {
      await context.close();
    }
  })();
  return collabBuild;
}

/** 当前构建没开协同时跳过用例的原因。 */
export const COLLAB_BUILD_REQUIRED =
  "当前 web 构建未开启笔记协同（NEXT_PUBLIC_COLLAB_NOTES=1），默认是单人保存";

/** 在移动端新建一篇笔记并停在编辑页（知识库不存在时先建），返回地址与 id。 */
export async function createMobileNote(page: Page, baseName: string, title: string) {
  await page.goto("/m/notes");
  const list = page.getByTestId("mobile-note-bases");
  await expect(list).toBeVisible({ timeout: 30_000 });
  await expect(list).not.toHaveAttribute("data-state", "loading", { timeout: 30_000 });
  const existing = page.getByRole("link", { name: new RegExp(baseName) });
  if ((await existing.count()) > 0) {
    await existing.first().click();
  } else {
    await page.getByTestId("mobile-base-create").click();
    await page.getByLabel("名称").fill(baseName);
    await page.getByLabel("简介").fill("移动端 E2E 自动创建");
    await page.getByRole("button", { name: "创建", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/m\/notes\/\d+$/, { timeout: 30_000 });
  await page.getByTestId("mobile-note-create").click();
  await page.getByLabel("标题").fill(title);
  await page.getByRole("button", { name: "创建笔记" }).click();
  await expect(page).toHaveURL(/\/m\/notes\/\d+\/\d+/, { timeout: 30_000 });
  await expect(page.locator(`${EDITOR_SURFACE} h1`).first()).toHaveText(title, { timeout: 30_000 });
  const url = page.url();
  return { url, noteId: Number(new URL(url).pathname.split("/").pop()) };
}

/**
 * 让协同令牌签发失败，编辑页退回单人保存链路（`PATCH /notes/{id}`）。
 * 构建打开了协同开关时用它测单人模式；没打开时它不起作用，本来就是单人模式。
 */
export async function forceSingleUser(page: Page) {
  await page.route("**/api/auth/collab-token", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: "B0400", msg: "协同服务不可用", data: null }),
    }),
  );
}

/** 在正文末尾另起一段输入文字。 */
export async function appendParagraph(page: Page, text: string) {
  await focusEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
}

/** 记录页面发出的笔记 PATCH 请求（服务端落库模式下应当为零）。 */
export function watchNotePatches(page: Page): string[] {
  const patches: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().includes("/api/proxy/note/notes/")) {
      patches.push(request.url());
    }
  });
  return patches;
}

/** 等库里的正文包含全部片段。 */
export async function waitStored(
  page: Page,
  noteId: number,
  fragments: string[],
  timeout = 20_000,
) {
  await expect
    .poll(
      async () => {
        try {
          const { content } = await readNote(page, noteId);
          return fragments.every((fragment) => content.includes(fragment));
        } catch {
          // 故障演练期间 note 服务可能短暂不可用，继续等
          return false;
        }
      },
      { timeout, intervals: [500, 1_000] },
    )
    .toBe(true);
}

/** 统计片段在正文里出现的次数（用来确认没有翻倍）。 */
export function occurrences(content: string, fragment: string): number {
  return content.split(fragment).length - 1;
}

export async function badgeStatus(page: Page) {
  return page.locator("[data-status]").first();
}
