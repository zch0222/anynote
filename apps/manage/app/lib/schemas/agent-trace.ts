/**
 * Agent 运行与 Trace 事件契约、类型及运行列表筛选纯函数。
 * 事件为 OTel 风格 span 结构，attributes 随事件类型多态，用 looseObject 承载并由归并层按类型窄化。
 */
import { z } from 'zod'

export const agentRunEventSchema = z.object({
  seq: z.number(),
  type: z.string(),
  content: z.unknown().nullish(),
  createTime: z.string().nullish(),
})
export type AgentRunEventRow = z.infer<typeof agentRunEventSchema>

/** 解析后的 span 结构 */
export interface TraceSpan {
  name?: string
  spanId?: string
  traceId?: string
  attributes?: Record<string, unknown>
  startTimeUnixNano?: number
  endTimeUnixNano?: number
}

export interface ParsedTraceEvent {
  seq: number
  type: string
  span: TraceSpan
}

/** 解析事件 content（后端按对象下发，兼容历史字符串）；非法内容降级为空 span */
export function parseTraceEvent(row: AgentRunEventRow): ParsedTraceEvent {
  let span: TraceSpan = {}
  try {
    if (typeof row.content === 'string') span = JSON.parse(row.content) as TraceSpan
    else if (row.content && typeof row.content === 'object') span = row.content as TraceSpan
  } catch {
    span = {}
  }
  return { seq: row.seq, type: row.type, span }
}

/** 工具行对象（用户视图）：名称只取自可见集 */
export const agentToolTargetSchema = z.looseObject({
  label: z.string().nullish(),
  resolved: z.boolean().nullish(),
})

/** 工具结果条目（用户视图） */
export const agentToolResultItemSchema = z.looseObject({
  ref: z.string().nullish(),
  title: z.string().nullish(),
  kbName: z.string().nullish(),
  kbId: z.number().nullish(),
})

/** 工具结果摘要（用户视图） */
export const agentToolResultSchema = z.looseObject({
  count: z.number().nullish(),
  items: z.array(agentToolResultItemSchema).nullish(),
})

/** 过程视图行（用户视图）：思考、工具调用、过程说明或重试 */
export const agentProcessItemSchema = z.looseObject({
  id: z.string().nullish(),
  type: z.string().nullish(),
  name: z.string().nullish(),
  text: z.string().nullish(),
  status: z.string().nullish(),
  durationMs: z.number().nullish(),
  target: agentToolTargetSchema.nullish(),
  result: agentToolResultSchema.nullish(),
})
export type AgentProcessItem = z.infer<typeof agentProcessItemSchema>

/** 详情接口返回结构（run + 用户可见过程视图 process） */
export const agentRunDetailSchema = z
  .looseObject({
    run: z.looseObject({
      runId: z.string().nullish(),
      userId: z.number().nullish(),
      conversationId: z.number().nullish(),
      agentVersion: z.string().nullish(),
      provider: z.string().nullish(),
      model: z.string().nullish(),
      state: z.string().nullish(),
      outcome: z.string().nullish(),
      startedAt: z.string().nullish(),
      finishedAt: z.string().nullish(),
      durationMs: z.number().nullish(),
      firstOutputMs: z.number().nullish(),
      toolCalls: z.number().nullish(),
      tokenUsage: z
        .looseObject({
          promptTokens: z.number().nullish(),
          completionTokens: z.number().nullish(),
          reasoningTokens: z.number().nullish(),
          totalTokens: z.number().nullish(),
        })
        .nullish(),
    }).nullish(),
    process: z.looseObject({
      items: z.array(agentProcessItemSchema).nullish(),
      durationMs: z.number().nullish(),
    }).nullish(),
  })
export type AgentRunDetail = z.infer<typeof agentRunDetailSchema>

/** Harness RunOutcome 的全部取值 */
export const RUN_OUTCOMES = ['ANSWERED', 'NOT_FOUND', 'FAILED', 'CANCELLED'] as const
export type RunOutcome = (typeof RUN_OUTCOMES)[number]

/** 运行列表的结果筛选项，“全部结果”用空值 */
export const RUN_OUTCOME_FILTERS = [
  { label: '全部结果', value: '' },
  { label: '正常回答', value: 'ANSWERED' },
  { label: '未找到', value: 'NOT_FOUND' },
  { label: '失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELLED' },
] as const

/** 结果下拉框里“全部结果”对应的选中值：下拉项的 value 不能是空字符串 */
export const ALL_OUTCOMES_VALUE = 'ALL'

/**
 * 筛选条件（空串表示全部）转下拉框选中值。
 * @param outcome 结果筛选条件
 * @return 下拉框选中值
 */
export function toOutcomeSelectValue(outcome: string): string {
  return outcome || ALL_OUTCOMES_VALUE
}

/**
 * 下拉框选中值转筛选条件。
 * @param value 下拉框选中值
 * @return 结果筛选条件，全部结果为空串
 */
export function fromOutcomeSelectValue(value: string): string {
  return value === ALL_OUTCOMES_VALUE ? '' : value
}

/** 结果下拉框的选项，“全部结果”用 ALL_OUTCOMES_VALUE 表示 */
export const RUN_OUTCOME_SELECT_ITEMS: { label: string, value: string }[] = RUN_OUTCOME_FILTERS.map((option) => ({
  label: option.label,
  value: toOutcomeSelectValue(option.value),
}))

/**
 * 运行结果徽章颜色。
 * @param outcome 运行结果，运行中为空
 * @return 正常回答为成功色，失败为错误色，已取消为中性色，其余为信息色
 */
export function runOutcomeColor(outcome?: string | null) {
  if (outcome === 'ANSWERED') return 'success' as const
  if (outcome === 'FAILED') return 'error' as const
  if (outcome === 'CANCELLED') return 'neutral' as const
  return 'info' as const
}

/** 运行列表的筛选条件与页码 */
export interface RunListUrlState {
  runId: string
  userId: string
  outcome: string
  page: number
}

/**
 * 从 URL 查询参数还原筛选条件与页码：非字符串的值、不在筛选项内的结果一律清空，页码须为正整数。
 * @param query URL 查询参数
 * @return 筛选条件与页码
 */
export function parseRunListQuery(query: Record<string, unknown> | undefined): RunListUrlState {
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  const outcome = text(query?.outcome)
  const page = Number(text(query?.page))
  return {
    runId: text(query?.runId),
    userId: text(query?.userId),
    outcome: RUN_OUTCOME_FILTERS.some((option) => option.value === outcome) ? outcome : '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  }
}

/**
 * 生成写入 URL 的查询参数：空值不写入，第 1 页不写入页码。
 * @param state 筛选条件与页码
 * @return 查询参数
 */
export function buildRunListQuery(state: RunListUrlState): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.runId) query.runId = state.runId
  if (state.userId) query.userId = state.userId
  if (state.outcome) query.outcome = state.outcome
  if (state.page > 1) query.page = String(state.page)
  return query
}
