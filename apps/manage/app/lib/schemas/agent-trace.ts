/**
 * Agent Trace 事件契约与类型：事件为 OTel 风格 span 结构。
 * attributes 随事件类型多态，用 looseObject 承载并由归并层按类型窄化。
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
      items: z.array(z.looseObject({
        id: z.string().nullish(),
        type: z.string().nullish(),
        name: z.string().nullish(),
        text: z.string().nullish(),
        status: z.string().nullish(),
        durationMs: z.number().nullish(),
      })).nullish(),
      durationMs: z.number().nullish(),
    }).nullish(),
  })
export type AgentRunDetail = z.infer<typeof agentRunDetailSchema>
