import { randomBytes } from "node:crypto";
import { type Page, expect, request } from "@playwright/test";
import type { E2EAccount } from "../global-setup";
import { mysql } from "./collab-persist";

export async function createAdminAccount(): Promise<E2EAccount> {
	const account: E2EAccount = {
		username: `e2e${randomBytes(5).toString("hex")}`,
		password: `Aa1${randomBytes(6).toString("hex")}`,
		nickname: "E2E 供应商管理员",
		sex: 0,
	};
	const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
	const context = await request.newContext({
		baseURL,
		ignoreHTTPSErrors: baseURL.startsWith("https:"),
	});
	try {
		const response = await context.post("/api/auth/register", {
			headers: { origin: baseURL },
			data: account,
		});
		const body = await response.json();
		expect(body.code).toBe("00000");
	} finally {
		await context.dispose();
	}
	const usernameHex = Buffer.from(account.username, "utf8").toString("hex");
	mysql(
		`UPDATE sys_user_role ur JOIN sys_user u ON ur.user_id = u.id SET ur.role_id = 1 WHERE u.username = 0x${usernameHex}`,
	);
	return account;
}

export async function loginForProviderTest(page: Page, account: E2EAccount) {
	const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
	const response = await page.request.post("/api/auth/login", {
		headers: { origin: baseURL },
		data: { username: account.username, password: account.password },
	});
	const body = await response.json();
	expect(body.code).toBe("00000");
}

export function providerKeyFor(account: E2EAccount): string {
	return `e2e-${account.username.slice(-10)}`;
}
