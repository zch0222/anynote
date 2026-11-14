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

test("管理员桌面端新增、保留 Key 更新并删除供应商", async ({ page }) => {
	await loginForProviderTest(page, admin);
	const key = providerKeyFor(admin);
	const secret = "sk-e2e-not-real";
	await page.goto("/settings/providers");
	await expect(page.getByTestId("settings-nav-providers")).toBeVisible();
	await page.getByTestId("provider-create").click();
	await page.getByTestId("provider-key-input").fill(key);
	await page.getByTestId("provider-name-input").fill("E2E OpenAI");
	await page
		.getByTestId("provider-url-input")
		.fill("https://api.example.com/v1");
	await page.getByTestId("provider-key-secret-input").fill(secret);
	await page
		.getByTestId("provider-models-input")
		.fill("gpt-test,gpt-test-fast");
	const createResponse = page.waitForResponse(
		(response) =>
			response.url().endsWith("/api/proxy/ai/v1/admin/model-providers") &&
			response.request().method() === "POST",
	);
	await page.getByTestId("provider-save").click();
	expect(JSON.stringify(await (await createResponse).json())).not.toContain(
		secret,
	);
	await expect(page.getByTestId(`provider-row-${key}`)).toBeVisible();

	await page
		.getByTestId(`provider-row-${key}`)
		.getByRole("button", { name: "编辑" })
		.click();
	await expect(page.getByTestId("provider-key-secret-input")).toHaveValue("");
	await page.getByTestId("provider-name-input").fill("E2E OpenAI 更新");
	await page.getByTestId("provider-save").click();
	await expect(page.getByTestId(`provider-row-${key}`)).toContainText(
		"E2E OpenAI 更新",
	);

	await page
		.getByTestId(`provider-row-${key}`)
		.getByRole("button", { name: "删除" })
		.click();
	await page.getByTestId("provider-delete-confirm").click();
	await expect(page.getByTestId(`provider-row-${key}`)).toHaveCount(0);
});

test("普通用户不能直接访问桌面供应商管理", async ({ page }) => {
	await loginForProviderTest(page, readAccount());
	await page.goto("/settings/providers");
	await expect(
		page.getByText("只有系统管理员可以管理模型供应商"),
	).toBeVisible();
	await expect(page.getByTestId("settings-nav-providers")).toHaveCount(0);
	const response = await page.request.get(
		"/api/proxy/ai/v1/admin/model-providers",
		{
			headers: { origin: new URL(page.url()).origin },
		},
	);
	expect((await response.json()).code).toBe("A0301");
});
