import { describe, expect, it } from "vitest";
import {
	emptyEmbeddingForm,
	emptyProviderForm,
	isValidProviderBaseUrl,
	parseEmbeddingDimensions,
	parseProviderModels,
	toEmbeddingForm,
	toProviderForm,
	validateEmbeddingForm,
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

describe("Embedding 运行时配置表单", () => {
	it("维度支持留空自动探测与 1 到 2048 整数校验", () => {
		expect(parseEmbeddingDimensions("")).toEqual({ ok: true, value: undefined });
		expect(parseEmbeddingDimensions("1536")).toEqual({ ok: true, value: 1536 });
		expect(parseEmbeddingDimensions("0")).toEqual({ ok: false });
		expect(parseEmbeddingDimensions("2049")).toEqual({ ok: false });
		expect(parseEmbeddingDimensions("15.5")).toEqual({ ok: false });
	});

	it("启用向量索引时强制校验供应商、模型与数据出境", () => {
		const providers = [
			{
				providerKey: "local",
				displayName: "Local",
				protocol: "openai_compatible",
				baseUrl: "http://localhost:11434/v1",
				models: ["bge-m3"],
				dataEgressAllowed: false,
				enabled: true,
				version: 1,
			},
			{
				providerKey: "openai",
				displayName: "OpenAI",
				protocol: "openai_compatible",
				baseUrl: "https://api.openai.com/v1",
				models: ["text-embedding-3-small"],
				dataEgressAllowed: true,
				enabled: true,
				version: 1,
			},
		];

		expect(validateEmbeddingForm(emptyEmbeddingForm(), providers)).toBeNull();
		expect(
			validateEmbeddingForm({ ...emptyEmbeddingForm(), enabled: true }, providers),
		).toBe("请选择模型供应商");
		expect(
			validateEmbeddingForm(
				{ ...emptyEmbeddingForm(), enabled: true, providerKey: "openai" },
				providers,
			),
		).toBe("请选择 Embedding 模型");
		expect(
			validateEmbeddingForm(
				{
					enabled: true,
					providerKey: "local",
					model: "bge-m3",
					dimensions: "1024",
				},
				providers,
			),
		).toBe("所选供应商未允许数据出境，无法用于知识向量索引");
		expect(
			validateEmbeddingForm(
				{
					enabled: true,
					providerKey: "openai",
					model: "text-embedding-3-small",
					dimensions: "3072",
				},
				providers,
			),
		).toBe("向量维度必须为 1 到 2048 之间的整数");
		expect(
			validateEmbeddingForm(
				{
					enabled: true,
					providerKey: "openai",
					model: "text-embedding-3-small",
					dimensions: "1536",
				},
				providers,
			),
		).toBeNull();
	});

	it("后端配置对象正确回填表单", () => {
		expect(
			toEmbeddingForm({
				logicalName: "embedding",
				providerKey: "openai",
				model: "text-embedding-3-small",
				dimensions: 1536,
				enabled: true,
				version: 2,
			}),
		).toEqual({
			enabled: true,
			providerKey: "openai",
			model: "text-embedding-3-small",
			dimensions: "1536",
		});
	});
});
