import { z } from "zod";

export const modelProviderSchema = z.object({
	providerKey: z.string(),
	displayName: z.string(),
	protocol: z.string(),
	baseUrl: z.string(),
	models: z.array(z.string()),
	dataEgressAllowed: z.boolean(),
	enabled: z.boolean(),
	version: z.number(),
	createTime: z.string().nullish(),
	updateTime: z.string().nullish(),
});

export type ModelProvider = z.infer<typeof modelProviderSchema>;

export const modelProviderListSchema = z.array(modelProviderSchema);

export type ProviderFormValue = {
	providerKey: string;
	displayName: string;
	protocol: string;
	baseUrl: string;
	apiKey: string;
	models: string;
	dataEgressAllowed: boolean;
	enabled: boolean;
};

export function emptyProviderForm(): ProviderFormValue {
	return {
		providerKey: "",
		displayName: "",
		protocol: "openai_compatible",
		baseUrl: "",
		apiKey: "",
		models: "",
		dataEgressAllowed: false,
		enabled: true,
	};
}

export function toProviderForm(provider: ModelProvider): ProviderFormValue {
	return {
		providerKey: provider.providerKey,
		displayName: provider.displayName,
		protocol: provider.protocol,
		baseUrl: provider.baseUrl,
		apiKey: "",
		models: provider.models.join(","),
		dataEgressAllowed: provider.dataEgressAllowed,
		enabled: provider.enabled,
	};
}

export function isValidProviderBaseUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			(url.protocol === "http:" || url.protocol === "https:") &&
			Boolean(url.hostname)
		);
	} catch {
		return false;
	}
}

export function parseProviderModels(value: string): string[] {
	return [
		...new Set(
			value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean),
		),
	];
}

export function validateProviderForm(
	value: ProviderFormValue,
	creating: boolean,
): string | null {
	if (!value.providerKey.trim()) return "供应商标识不能为空";
	if (!value.displayName.trim()) return "供应商展示名不能为空";
	if (!value.baseUrl.trim()) return "接口基地址不能为空";
	if (!isValidProviderBaseUrl(value.baseUrl.trim())) {
		return "接口基地址必须是有效的 HTTP 或 HTTPS 地址";
	}
	if (creating && !value.apiKey.trim()) return "请输入 API Key";
	return null;
}

export const embeddingModelConfigSchema = z.object({
	logicalName: z.string().nullish(),
	providerKey: z.string().nullish(),
	model: z.string().nullish(),
	dimensions: z.number().int().nullish(),
	enabled: z.boolean().default(false),
	version: z.number().nullish(),
	updateTime: z.string().nullish(),
});

export type EmbeddingModelConfig = z.infer<typeof embeddingModelConfigSchema>;

export type EmbeddingFormValue = {
	enabled: boolean;
	providerKey: string;
	model: string;
	dimensions: string;
};

export function emptyEmbeddingForm(): EmbeddingFormValue {
	return {
		enabled: false,
		providerKey: "",
		model: "",
		dimensions: "",
	};
}

export function toEmbeddingForm(
	config?: EmbeddingModelConfig | null,
): EmbeddingFormValue {
	if (!config) return emptyEmbeddingForm();
	return {
		enabled: Boolean(config.enabled),
		providerKey: config.providerKey ?? "",
		model: config.model ?? "",
		dimensions: config.dimensions != null ? String(config.dimensions) : "",
	};
}

export function parseEmbeddingDimensions(
	value: string,
): { ok: true; value: number | undefined } | { ok: false } {
	const trimmed = value.trim();
	if (!trimmed) return { ok: true, value: undefined };
	if (!/^\d+$/.test(trimmed)) return { ok: false };
	const parsed = Number(trimmed);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2048) {
		return { ok: false };
	}
	return { ok: true, value: parsed };
}

export function validateEmbeddingForm(
	value: EmbeddingFormValue,
	providers?: ModelProvider[],
): string | null {
	if (!parseEmbeddingDimensions(value.dimensions).ok) {
		return "向量维度必须为 1 到 2048 之间的整数";
	}
	if (!value.enabled) return null;
	const providerKey = value.providerKey.trim();
	if (!providerKey) return "请选择模型供应商";
	if (!value.model.trim()) return "请选择 Embedding 模型";
	const selected = providers?.find((item) => item.providerKey === providerKey);
	if (selected && !selected.dataEgressAllowed) {
		return "所选供应商未允许数据出境，无法用于知识向量索引";
	}
	return null;
}
