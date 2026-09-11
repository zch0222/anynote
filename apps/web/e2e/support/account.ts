import { readFileSync } from "node:fs";
import { type Page, expect } from "@playwright/test";
import { ACCOUNT_PATH, type E2EAccount } from "../global-setup";

/** 读 global-setup 建好的临时账号。 */
export function readAccount(): E2EAccount {
  return JSON.parse(readFileSync(ACCOUNT_PATH, "utf8")) as E2EAccount;
}

/** 走真实 UI 登录（不吃 storageState），用于验证登录链路本身。 */
export async function loginThroughUi(page: Page, account: E2EAccount) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(account.username);
  await page.getByLabel("密码").fill(account.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * 确保存在至少一个知识库，返回其名称。
 *
 * 笔记必须挂在知识库下，而 E2E 账号是全新的——没有这一步，
 * 创建笔记的用例第一次跑必然失败。
 */
export async function ensureKnowledgeBase(page: Page, name: string): Promise<void> {
  await page.goto("/notes");
  const existing = page.getByRole("link").filter({ hasText: name });
  if ((await existing.count()) > 0) return;

  await page.getByRole("button", { name: /新建知识库/ }).click();
  await page.getByLabel("名称").fill(name);
  await page.getByLabel("简介").fill("E2E 用例自动创建");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
}
