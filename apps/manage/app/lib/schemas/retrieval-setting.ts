/**
 * 知识检索 24 项参数元数据表、交叉校验与 zod 契约。
 * 上下界/默认值与后端 RetrievalSetting 默认值严格对齐（方案 §5.5）。
 */
import { z } from 'zod'

export interface RetrievalFieldMeta {
  key: string
  label: string
  hint?: string
  min: number
  max: number
  step: number
  defaultValue: number
  integer: boolean
}

export interface RetrievalGroupMeta {
  id: string
  title: string
  description?: string
  fields: RetrievalFieldMeta[]
}

function int(key: string, label: string, min: number, max: number, def: number, hint?: string): RetrievalFieldMeta {
  return { key, label, min, max, step: 1, defaultValue: def, integer: true, hint }
}
function num(key: string, label: string, def: number, hint?: string): RetrievalFieldMeta {
  return { key, label, min: 0, max: 5, step: 0.05, defaultValue: def, integer: false, hint }
}

/** 五分组 24 项参数元数据（rerankEnabled 单独作布尔开关，不在数值元数据内） */
export const RETRIEVAL_GROUPS: RetrievalGroupMeta[] = [
  {
    id: 'fusion',
    title: '召回规模与 RRF 融合',
    description: 'score = Σ wᵢ / (k + rankᵢ)；rrfK 增大可平滑头部排名',
    fields: [
      int('rrfK', 'RRF 融合常数 k', 1, 1000, 60),
      int('channelCandidates', '每通道候选条数', 10, 200, 50),
      int('shortKeywordChars', '短关键词字符阈值', 1, 20, 4),
    ],
  },
  {
    id: 'weights',
    title: '查询类型通道权重（0.00–5.00）',
    fields: [
      num('keywordLexicalWeight', '关键词型 · 全文权重', 1.5),
      num('keywordSemanticWeight', '关键词型 · 语义权重', 0.5),
      num('questionLexicalWeight', '完整问句 · 全文权重', 1.0),
      num('questionSemanticWeight', '完整问句 · 语义权重', 1.2),
      num('defaultLexicalWeight', '默认 · 全文权重', 1.0),
      num('defaultSemanticWeight', '默认 · 语义权重', 1.0),
      num('itemWeight', '条目级通道权重', 0.8),
    ],
  },
  {
    id: 'authority',
    title: '语料权威性系数（0.00–5.00）',
    fields: [
      num('authorityOriginal', '原始内容', 1.0),
      num('authorityTranscript', '字幕转写', 0.9),
      num('authorityGenerated', 'AI 生成总结', 0.7),
    ],
  },
  {
    id: 'budget',
    title: '片段去重、邻居扩展与阅读预算',
    fields: [
      int('maxChunksPerEntity', '每实体最多保留片段', 1, 10, 3),
      int('searchDefaultLimit', '默认返回条数', 1, 50, 10),
      int('searchMaxLimit', '最大返回条数', 1, 50, 20),
      int('neighborWindow', '邻居扩展窗口', 0, 3, 1),
      int('neighborMaxChars', '邻居扩展字符上限', 0, 20000, 6000),
      int('readMaxChars', 'kb_read 单次阅读上限', 500, 20000, 2000),
    ],
  },
  {
    id: 'grep',
    title: '原文查找（kb_grep）与重排',
    fields: [
      int('grepMaxHits', 'grep 最大命中条数', 1, 200, 50),
      int('grepContextDefault', 'grep 默认上下文行数', 0, 5, 2),
      int('grepContextMax', 'grep 最大上下文行数', 0, 10, 5),
      int('grepKbCandidates', 'grep 库范围候选实体数', 1, 50, 20),
    ],
  },
]

const numericKeys = RETRIEVAL_GROUPS.flatMap((g) => g.fields.map((f) => f.key)) as RetrievalNumericKey[]

/** 23 个数值参数键（rerankEnabled 单独为布尔） */
export type RetrievalNumericKey =
  | 'rrfK' | 'channelCandidates' | 'shortKeywordChars'
  | 'keywordLexicalWeight' | 'keywordSemanticWeight'
  | 'questionLexicalWeight' | 'questionSemanticWeight'
  | 'defaultLexicalWeight' | 'defaultSemanticWeight' | 'itemWeight'
  | 'authorityOriginal' | 'authorityTranscript' | 'authorityGenerated'
  | 'maxChunksPerEntity' | 'searchDefaultLimit' | 'searchMaxLimit'
  | 'neighborWindow' | 'neighborMaxChars' | 'readMaxChars'
  | 'grepMaxHits' | 'grepContextDefault' | 'grepContextMax' | 'grepKbCandidates'

/** 检索参数表单值类型（23 数值 + 1 布尔，全部必填） */
export type RetrievalValues = Record<RetrievalNumericKey, number> & { rerankEnabled: boolean }

export const retrievalSettingVoSchema = z
  .looseObject({
    version: z.number().nullish(),
    updateTime: z.string().nullish(),
    rerankEnabled: z.boolean(),
  })
  .catchall(z.unknown())
export type RetrievalSettingVO = z.infer<typeof retrievalSettingVoSchema>

/** 推荐默认值快照（含 rerankEnabled=false） */
export function defaultRetrievalValues(): RetrievalValues {
  const values: Record<string, number> = {}
  for (const field of RETRIEVAL_GROUPS.flatMap((g) => g.fields)) {
    values[field.key] = field.defaultValue
  }
  return { ...values, rerankEnabled: false } as RetrievalValues
}

/** 从后端 VO 提取表单值，缺失字段回落默认值 */
export function toRetrievalValues(vo: RetrievalSettingVO | null | undefined): RetrievalValues {
  const values = defaultRetrievalValues()
  if (!vo) return values
  const record = vo as Record<string, unknown>
  for (const key of numericKeys) {
    if (typeof record[key] === 'number') values[key] = record[key] as number
  }
  if (typeof vo.rerankEnabled === 'boolean') values.rerankEnabled = vo.rerankEnabled
  return values
}

const FIELD_META = new Map(RETRIEVAL_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f])))

/** 单字段边界校验：合法返回 null，越界/非数值返回确认文案 */
export function validateRetrievalField(key: string, value: number): string | null {
  const meta = FIELD_META.get(key)
  if (!meta) return null
  if (!Number.isFinite(value)) return '参数超出允许范围'
  if (meta.integer && !Number.isInteger(value)) return '参数超出允许范围'
  if (value < meta.min || value > meta.max) return '参数超出允许范围'
  return null
}

/** 全量校验：边界 + 交叉约束，返回第一个错误 */
export function validateRetrievalValues(values: RetrievalValues): string | null {
  for (const key of numericKeys) {
    const error = validateRetrievalField(key, values[key])
    if (error) return error
  }
  if (values.searchDefaultLimit > values.searchMaxLimit) {
    return '默认返回条数不能大于最大返回条数'
  }
  if (values.grepContextDefault > values.grepContextMax) {
    return 'grep 默认上下文行数不能大于最大上下文行数'
  }
  return null
}

/** 计算与系统默认值的差异键集合（差异徽章） */
export function diffFromDefaults(values: RetrievalValues): Set<string> {
  const defaults = defaultRetrievalValues()
  const diff = new Set<string>()
  for (const key of [...numericKeys, 'rerankEnabled']) {
    if ((values as Record<string, unknown>)[key] !== (defaults as Record<string, unknown>)[key]) diff.add(key)
  }
  return diff
}

/** 表单值转 PUT 请求体（23 数值 + 布尔，键序无关） */
export function toRetrievalUpdateBody(values: RetrievalValues): Record<string, number | boolean> {
  const body: Record<string, number | boolean> = {}
  for (const key of numericKeys) body[key] = values[key]
  body.rerankEnabled = values.rerankEnabled
  return body
}
