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
