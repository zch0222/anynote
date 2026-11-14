import { describe, expect, it } from "vitest";
import {
	emptyProviderForm,
	isValidProviderBaseUrl,
	parseProviderModels,
	toProviderForm,
	validateProviderForm,
} from "../schemas";

describe("模型供应商表单", () => {
	it("只接受带主机的 HTTP/HTTPS 地址", () => {
		expect(isValidProviderBaseUrl("http://localhost:8000/v1")).toBe(true);
		expect(isValidProviderBaseUrl("https://api.example.com/v1")).toBe(true);
		expect(isValidProviderBaseUrl("file:///tmp/model")).toBe(false);
		expect(isValidProviderBaseUrl("not-a-url")).toBe(false);
	});

	it("模型名按英文逗号拆分、去空并去重", () => {
		expect(parseProviderModels("gpt-4o, gpt-4o-mini,gpt-4o, ,")).toEqual([
			"gpt-4o",
			"gpt-4o-mini",
		]);
	});

	it("新增要求 Key，更新允许留空保留", () => {
		const form = {
			...emptyProviderForm(),
			providerKey: "openai",
			displayName: "OpenAI",
			baseUrl: "https://api.openai.com/v1",
		};
		expect(validateProviderForm(form, true)).toBe("请输入 API Key");
		expect(validateProviderForm(form, false)).toBeNull();
	});

	it("编辑表单不回填 API Key", () => {
		const form = toProviderForm({
			providerKey: "openai",
			displayName: "OpenAI",
			protocol: "openai_compatible",
			baseUrl: "https://api.openai.com/v1",
			models: ["gpt-4o"],
			dataEgressAllowed: true,
			enabled: true,
			version: 2,
		});
		expect(form.apiKey).toBe("");
		expect(form.models).toBe("gpt-4o");
	});
});
