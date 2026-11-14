import { expect, test } from "@playwright/test";
import type { E2EAccount } from "./global-setup";
import { readAccount } from "./support/account";
import {
	createAdminAccount,
	loginForProviderTest,
	providerKeyFor,
} from "./support/model-provider";

test.use({ storageState: { cookies: [], origins: [] } });

let admin: E2EAccount;
test.beforeAll(async () => {
	admin = await createAdminAccount();
});

test("管理员移动端新增、编辑并删除供应商", async ({ page }) => {
	await loginForProviderTest(page, admin);
	const key = providerKeyFor(admin);
	await page.goto("/m/settings/providers");
	await page.getByTestId("provider-create").click();
	await page.getByTestId("provider-key-input").fill(key);
	await page.getByTestId("provider-name-input").fill("E2E 移动供应商");
	await page
		.getByTestId("provider-url-input")
		.fill("https://mobile.example.com/v1");
	await page
		.getByTestId("provider-key-secret-input")
		.fill("sk-mobile-not-real");
	await page.getByTestId("provider-models-input").fill("gpt-mobile");
	await page.getByTestId("provider-save").click();
	const card = page.getByTestId(`provider-card-${key}`);
	await expect(card).toBeVisible();

	await card.getByRole("button", { name: "编辑" }).click();
	await page.getByTestId("provider-name-input").fill("E2E 移动供应商更新");
	await page.getByTestId("provider-save").click();
	await expect(card).toContainText("E2E 移动供应商更新");

	await card.getByRole("button", { name: "删除" }).click();
	await page.getByTestId("provider-delete-confirm").click();
	await expect(card).toHaveCount(0);
});

test("普通用户不能直接访问移动端供应商管理", async ({ page }) => {
	await loginForProviderTest(page, readAccount());
	await page.goto("/m/settings/providers");
	await expect(
		page.getByText("只有系统管理员可以管理模型供应商"),
	).toBeVisible();
});
