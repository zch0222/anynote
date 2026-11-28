/**
 * 模型供应商与逻辑模型校验纯函数、zod 契约。
 * 文案为 2026-11-27 用户逐项拍板口径，改动需先确认。
 */
import { z } from 'zod'

/** 供应商管理端 VO */
export const modelProviderSchema = z.object({
  providerKey: z.string(),
  displayName: z.string(),
  protocol: z.string(),
  baseUrl: z.string(),
  models: z.array(z.string()),
  dataEgressAllowed: z.boolean(),
  enabled: z.boolean(),
  processReasoningMaxChars: z.number().int(),
  version: z.number().nullish(),
  createTime: z.string().nullish(),
  updateTime: z.string().nullish(),
})
export type ModelProvider = z.infer<typeof modelProviderSchema>
export const modelProviderListSchema = z.array(modelProviderSchema)

/** 逻辑模型配置 VO */
export const logicalModelConfigSchema = z.object({
  logicalName: z.string().nullish(),
  providerKey: z.string().nullish(),
  model: z.string().nullish(),
  dimensions: z.number().int().nullish(),
  reasoningFormat: z.enum(['none', 'reasoning_content', 'reasoning', 'think_tag']).nullish(),
  reasoningPassthrough: z.enum(['none', 'empty', 'original']).nullish(),
  supportsVision: z.boolean().nullish(),
  enabled: z.boolean().nullish(),
  version: z.number().nullish(),
  updateTime: z.string().nullish(),
})
export type LogicalModelConfig = z.infer<typeof logicalModelConfigSchema>

/** 思考截断字数默认值，与数据库列默认值一致 */
export const DEFAULT_PROCESS_REASONING_MAX_CHARS = 8000

export interface ProviderFormValue {
  providerKey: string
  displayName: string
  protocol: string
  baseUrl: string
  apiKey: string
  models: string
  dataEgressAllowed: boolean
  enabled: boolean
  processReasoningMaxChars: string
}

export function emptyProviderForm(): ProviderFormValue {
  return {
    providerKey: '',
    displayName: '',
    protocol: 'openai_compatible',
    baseUrl: '',
    apiKey: '',
    models: '',
    dataEgressAllowed: false,
    enabled: true,
    processReasoningMaxChars: String(DEFAULT_PROCESS_REASONING_MAX_CHARS),
  }
}

export function toProviderForm(provider: ModelProvider): ProviderFormValue {
  return {
    providerKey: provider.providerKey,
    displayName: provider.displayName,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    apiKey: '',
    models: provider.models.join(','),
    dataEgressAllowed: provider.dataEgressAllowed,
    enabled: provider.enabled,
    processReasoningMaxChars: String(provider.processReasoningMaxChars),
  }
}

/** 解析思考截断字数，只接受 500 到 200000 的整数 */
export function parseProcessReasoningMaxChars(value: string): number | null {
  const text = value.trim()
  if (!/^\d+$/.test(text)) return null
  const parsed = Number(text)
  return parsed >= 500 && parsed <= 200000 ? parsed : null
}

export function isValidProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname)
  } catch {
    return false
  }
}

/** 逗号分隔批量解析模型标识，自动去重去空 */
export function parseProviderModels(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

/** 供应商表单校验，返回第一个错误文案，合法为 null */
export function validateProviderForm(value: ProviderFormValue, creating: boolean): string | null {
  if (!value.providerKey.trim()) return '请输入供应商标识'
  if (!value.displayName.trim()) return '请输入供应商展示名称'
  if (!isValidProviderBaseUrl(value.baseUrl.trim())) return '请输入合法的 Base URL'
  if (creating && !value.apiKey.trim()) return '新增供应商时必须输入 API Key'
  if (parseProviderModels(value.models).length === 0) return '至少填写一个模型标识'
  if (parseProcessReasoningMaxChars(value.processReasoningMaxChars) === null) {
    return '思考截断字数需在 500 到 200000 之间'
  }
  return null
}

export type ReasoningFormat = 'none' | 'reasoning_content' | 'reasoning' | 'think_tag'
export type ReasoningPassthrough = 'none' | 'empty' | 'original'

/** 逻辑模型卡片元数据：agent_main / fast / embedding 的展示与能力开关 */
export const LOGICAL_MODEL_CARDS = [
  {
    logicalName: 'agent_main',
    title: '主对话模型（agent_main）',
    description: '知识库 Agent 对话使用的主模型；运行中的对话继续用开跑时的配置，新对话立即使用新配置。',
    chat: true,
    vision: true,
  },
  {
    logicalName: 'fast',
    title: '历史压缩模型（fast）',
    description: '压缩较早会话历史使用的轻量模型；未配置时历史不压缩，只保留最近几轮。',
    chat: true,
    vision: false,
  },
  {
    logicalName: 'embedding',
    title: '向量索引模型（embedding）',
    description: '知识库索引向量化使用的模型与维度；修改向量模型或维度后，需在索引 Worker 执行 rebuild 重建物理索引方可生效。',
    chat: false,
    vision: false,
  },
] as const

export type LogicalName = (typeof LOGICAL_MODEL_CARDS)[number]['logicalName']

export interface LogicalFormValue {
  enabled: boolean
  providerKey: string
  model: string
  dimensions: string
  reasoningFormat: ReasoningFormat
  reasoningPassthrough: ReasoningPassthrough
  supportsVision: boolean
}

export function emptyLogicalForm(): LogicalFormValue {
  return {
    enabled: false,
    providerKey: '',
    model: '',
    dimensions: '',
    reasoningFormat: 'none',
    reasoningPassthrough: 'none',
    supportsVision: false,
  }
}

export function toLogicalForm(config?: LogicalModelConfig | null): LogicalFormValue {
  if (!config) return emptyLogicalForm()
  return {
    enabled: Boolean(config.enabled),
    providerKey: config.providerKey ?? '',
    model: config.model ?? '',
    dimensions: config.dimensions != null ? String(config.dimensions) : '',
    reasoningFormat: config.reasoningFormat ?? 'none',
    reasoningPassthrough: config.reasoningPassthrough ?? 'none',
    supportsVision: Boolean(config.supportsVision),
  }
}

/** 解析向量维度：留空合法（自动探测），否则须为 1..2048 整数 */
export function parseEmbeddingDimensions(
  value: string,
): { ok: true; value: number | undefined } | { ok: false } {
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: undefined }
  if (!/^\d+$/.test(trimmed)) return { ok: false }
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2048) return { ok: false }
  return { ok: true, value: parsed }
}

/** 逻辑模型表单校验（含数据出境硬阻断），返回错误文案或 null */
export function validateLogicalForm(
  value: LogicalFormValue,
  logicalName: string,
  providers?: ModelProvider[],
): string | null {
  if (logicalName === 'embedding' && !parseEmbeddingDimensions(value.dimensions).ok) {
    return '向量维度需在 1 到 2048 之间'
  }
  if (!value.enabled) return null
  const providerKey = value.providerKey.trim()
  if (!providerKey) return '请输入供应商标识'
  if (!value.model.trim()) return '至少填写一个模型标识'
  const selected = providers?.find((item) => item.providerKey === providerKey)
  if (selected && !selected.dataEgressAllowed) {
    return '当前供应商禁止数据出境，不能启用该逻辑模型'
  }
  return null
}

/** 检测供应商被哪些逻辑模型绑定（删除预检警告） */
export function findLogicalReferencers(
  providerKey: string,
  configs: (LogicalModelConfig | null | undefined)[],
): string[] {
  return configs
    .filter((config) => config?.providerKey === providerKey)
    .map((config) => config?.logicalName ?? '')
    .filter(Boolean)
}

/** 删除供应商确认文案（含引用预检警告） */
export function buildDeleteProviderMessage(displayName: string, referencers: string[]): string {
  const base = `确认删除供应商“${displayName}”？此操作不可恢复。`
  if (referencers.length === 0) return base
  return `${base} 当前供应商正被逻辑模型 [${referencers.join(', ')}] 绑定，删除后新发起的对话将无法启动。`
}
