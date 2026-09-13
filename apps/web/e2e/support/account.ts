import { readFileSync } from "node:fs";
import { type Page, expect } from "@playwright/test";
import { ACCOUNT_PATH, type E2EAccount } from "../global-setup";

/** 读 global-setup 建好的临时账号。 */
export function readAccount(): E2EAccount {
  return JSON.parse(readFileSync(ACCOUNT_PATH, "utf8")) as E2EAccount;
}

/**
 * 走真实 UI 登录（不吃 storageState），用于验证登录链路本身。
 *
 * 落点是 `/dashboard`：重设计后它重定向到知识库画廊 `/notes`，
 * 所以这里等的是最终地址——断言中间那一次 307 只会让用例更脆。
 */
export async function loginThroughUi(page: Page, account: E2EAccount) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/notes$/, { timeout: 30_000 });
}

/**
 * 确保存在至少一个知识库，返回其名称。
 *
 * 笔记必须挂在知识库下，而 E2E 账号是全新的——没有这一步，
 * 创建笔记的用例第一次跑必然失败。
 *
 * 创建成功后画廊会跳到新库的笔记页（`/notes/<id>`），所以这里不假设停在画廊。
 */
/** 等画廊加载结束（`data-state` 不是 loading），返回终态。 */
async function waitForGallery(page: Page): Promise<string> {
  const gallery = page.getByTestId("kb-gallery");
  await expect(gallery).toBeVisible({ timeout: 30_000 });
  await expect(gallery).not.toHaveAttribute("data-state", "loading", { timeout: 30_000 });
  return (await gallery.getAttribute("data-state")) ?? "";
}

export async function ensureKnowledgeBase(page: Page, name: string): Promise<void> {
  await page.goto("/notes");
  // 画廊是客户端取数的：`count()` 不会等待，列表还在加载时会读到 0 而重复建库。
  await waitForGallery(page);

  const existing = page.getByRole("link").filter({ hasText: name });
  if ((await existing.count()) > 0) return;

  // 画廊上「新建知识库」有两个触发点（页头主按钮 + 网格末尾的卡片），
  // 用 testid 而不是可访问名定位，否则两个都命中会触发 strict mode 报错。
  await page.getByTestId("gallery-new-base").click();
  await page.getByLabel("名称").fill(name);
  await page.getByLabel("简介").fill("E2E 用例自动创建");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/\d+$/, { timeout: 30_000 });
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
}

/** 打开某个知识库的笔记 Tab（画廊卡片或侧栏都可点，取画廊卡片）。 */
export async function openKnowledgeBase(page: Page, name: string) {
  await page.goto("/notes");
  await waitForGallery(page);
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/notes\/\d+$/, { timeout: 30_000 });
}
