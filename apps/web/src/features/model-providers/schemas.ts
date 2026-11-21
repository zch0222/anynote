import { z } from "zod";

export const modelProviderSchema = z.object({
  providerKey: z.string(),
  displayName: z.string(),
  protocol: z.string(),
  baseUrl: z.string(),
  models: z.array(z.string()),
  dataEgressAllowed: z.boolean(),
  enabled: z.boolean(),
  processReasoningMaxChars: z.number().int(),
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
  processReasoningMaxChars: string;
};

/** 思考截断字数的默认值，与数据库列默认值一致。 */
export const DEFAULT_PROCESS_REASONING_MAX_CHARS = 8000;

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
    processReasoningMaxChars: String(DEFAULT_PROCESS_REASONING_MAX_CHARS),
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
    processReasoningMaxChars: String(provider.processReasoningMaxChars),
  };
}

/**
 * 解析思考截断字数，只接受 500 到 200000 之间的整数。
 *
 * @param value 表单输入
 * @returns 合法时为整数，否则为 null
 */
export function parseProcessReasoningMaxChars(value: string): number | null {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return parsed >= 500 && parsed <= 200000 ? parsed : null;
}

export function isValidProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
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

export function validateProviderForm(value: ProviderFormValue, creating: boolean): string | null {
  if (!value.providerKey.trim()) return "供应商标识不能为空";
  if (!value.displayName.trim()) return "供应商展示名不能为空";
  if (!value.baseUrl.trim()) return "接口基地址不能为空";
  if (!isValidProviderBaseUrl(value.baseUrl.trim())) {
    return "接口基地址必须是有效的 HTTP 或 HTTPS 地址";
  }
  if (creating && !value.apiKey.trim()) return "请输入 API Key";
  if (parseProcessReasoningMaxChars(value.processReasoningMaxChars) === null) {
    return "思考截断字数必须为 500 到 200000 之间的整数";
  }
  return null;
}

export const reasoningFormatSchema = z.enum([
  "none",
  "reasoning_content",
  "reasoning",
  "think_tag",
]);
export type ReasoningFormat = z.infer<typeof reasoningFormatSchema>;

export const reasoningPassthroughSchema = z.enum(["none", "empty", "original"]);
export type ReasoningPassthrough = z.infer<typeof reasoningPassthroughSchema>;

export const logicalModelConfigSchema = z.object({
  logicalName: z.string().nullish(),
  providerKey: z.string().nullish(),
  model: z.string().nullish(),
  dimensions: z.number().int().nullish(),
  reasoningFormat: reasoningFormatSchema.nullish(),
  reasoningPassthrough: reasoningPassthroughSchema.nullish(),
  enabled: z.boolean().default(false),
  version: z.number().nullish(),
  updateTime: z.string().nullish(),
});

export type LogicalModelConfig = z.infer<typeof logicalModelConfigSchema>;

/** 逻辑模型用途名与展示文案（设置页三张卡片的单一来源）。 */
export const LOGICAL_MODEL_CARDS = [
  {
    logicalName: "agent_main",
    title: "主对话模型（agent_main）",
    description:
      "配置知识库 Agent 对话使用的主模型；运行中的对话继续用开跑时的配置，新对话立即使用新配置。",
    toggleLabel: "启用主对话模型",
    chat: true as const,
  },
  {
    logicalName: "fast",
    title: "历史压缩模型（fast）",
    description: "配置压缩较早会话历史使用的轻量模型；未配置时代理会话历史不压缩，只保留最近几轮。",
    toggleLabel: "启用历史压缩模型",
    chat: true as const,
  },
  {
    logicalName: "embedding",
    title: "向量索引模型（Embedding）",
    description: "配置知识库索引向量化使用的模型、维度与开关；变更模型或维度后需执行索引重建生效。",
    toggleLabel: "启用向量索引",
    chat: false as const,
  },
] as const;

export type LogicalFormValue = {
  enabled: boolean;
  providerKey: string;
  model: string;
  dimensions: string;
  reasoningFormat: ReasoningFormat;
  reasoningPassthrough: ReasoningPassthrough;
};

export function emptyLogicalForm(): LogicalFormValue {
  return {
    enabled: false,
    providerKey: "",
    model: "",
    dimensions: "",
    reasoningFormat: "none",
    reasoningPassthrough: "none",
  };
}

export function toLogicalForm(config?: LogicalModelConfig | null): LogicalFormValue {
  if (!config) return emptyLogicalForm();
  return {
    enabled: Boolean(config.enabled),
    providerKey: config.providerKey ?? "",
    model: config.model ?? "",
    dimensions: config.dimensions != null ? String(config.dimensions) : "",
    reasoningFormat: config.reasoningFormat ?? "none",
    reasoningPassthrough: config.reasoningPassthrough ?? "none",
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

/**
 * 校验逻辑模型表单：embedding 用向量口径文案，agent_main/fast 用对话口径文案。
 *
 * @param value 表单值
 * @param logicalName 逻辑模型用途名
 * @param providers 可选的供应商列表（用于数据出境校验）
 * @returns 错误文案，合法时为 null
 */
export function validateLogicalForm(
  value: LogicalFormValue,
  logicalName: string,
  providers?: ModelProvider[],
): string | null {
  const isEmbedding = logicalName === "embedding";
  if (isEmbedding && !parseEmbeddingDimensions(value.dimensions).ok) {
    return "向量维度必须为 1 到 2048 之间的整数";
  }
  if (!value.enabled) return null;
  const providerKey = value.providerKey.trim();
  if (!providerKey) return "请选择模型供应商";
  if (!value.model.trim()) {
    return isEmbedding ? "请选择 Embedding 模型" : "请选择模型";
  }
  const selected = providers?.find((item) => item.providerKey === providerKey);
  if (selected && !selected.dataEgressAllowed) {
    return isEmbedding
      ? "所选供应商未允许数据出境，无法用于知识向量索引"
      : "所选供应商未允许数据出境，无法用于知识对话";
  }
  return null;
}
