/**
 * AI 运行统计看板纯函数：时间窗解析、毫秒与 Token 展示格式化、zod 契约。
 */
import { z } from 'zod'

export type StatsWindowKey = '24h' | '7d' | '30d'

export interface StatsWindow {
  startedFrom: string
  startedTo: string
  granularity: 'HOUR' | 'DAY'
}

/** 按窗口键计算 ISO 查询区间与分桶粒度（24h 按小时，其余按天） */
export function resolveStatsWindow(key: StatsWindowKey, now: Date = new Date()): StatsWindow {
  const hours = key === '24h' ? 24 : key === '7d' ? 24 * 7 : 24 * 30
  const startedTo = now
  const startedFrom = new Date(now.getTime() - hours * 3600 * 1000)
  return {
    startedFrom: startedFrom.toISOString(),
    startedTo: startedTo.toISOString(),
    granularity: key === '24h' ? 'HOUR' : 'DAY',
  }
}

/** 毫秒时长格式化：<1s 毫秒显示，否则保留两位秒 */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** 大数字紧凑格式化（Token 计数） */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`
  return String(Math.round(n))
}

/** 成功率百分比（无运行返回占位） */
export function formatSuccessRate(succeeded: number, total: number): string {
  if (!total) return '—'
  return `${((succeeded / total) * 100).toFixed(1)}%`
}

/** 运行统计时间桶 */
export const timeBucketSchema = z.object({
  bucketStart: z.string().nullish(),
  totalRuns: z.number().nullish(),
  succeededRuns: z.number().nullish(),
  failedRuns: z.number().nullish(),
  totalTokens: z.number().nullish(),
  avgDurationMs: z.number().nullish(),
})

/** 运行统计模型分布桶 */
export const modelBucketSchema = z.object({
  provider: z.string().nullish(),
  model: z.string().nullish(),
  runs: z.number().nullish(),
  totalTokens: z.number().nullish(),
})

/** 管理端运行统计响应 */
export const agentRunStatsSchema = z.object({
  totalRuns: z.number().nullish(),
  runningRuns: z.number().nullish(),
  succeededRuns: z.number().nullish(),
  failedRuns: z.number().nullish(),
  cancelledRuns: z.number().nullish(),
  promptTokens: z.number().nullish(),
  completionTokens: z.number().nullish(),
  reasoningTokens: z.number().nullish(),
  totalTokens: z.number().nullish(),
  avgDurationMs: z.number().nullish(),
  p95DurationMs: z.number().nullish(),
  avgFirstOutputMs: z.number().nullish(),
  p95FirstOutputMs: z.number().nullish(),
  avgToolCalls: z.number().nullish(),
  outcomes: z.array(z.object({ outcome: z.string().nullish(), count: z.number().nullish() })).nullish(),
  models: z.array(modelBucketSchema).nullish(),
  series: z.array(timeBucketSchema).nullish(),
})
export type AgentRunStats = z.infer<typeof agentRunStatsSchema>

/** 运行列表行 */
export const agentRunListItemSchema = z.object({
  runId: z.string().nullish(),
  userId: z.number().nullish(),
  conversationId: z.number().nullish(),
  agentVersion: z.string().nullish(),
  provider: z.string().nullish(),
  model: z.string().nullish(),
  state: z.string().nullish(),
  outcome: z.string().nullish(),
  startedAt: z.string().nullish(),
  durationMs: z.number().nullish(),
  firstOutputMs: z.number().nullish(),
  toolCalls: z.number().nullish(),
  tokenUsage: z
    .looseObject({ totalTokens: z.number().nullish(), reasoningTokens: z.number().nullish() })
    .nullish(),
})
export type AgentRunListItem = z.infer<typeof agentRunListItemSchema>

/** 运行列表分页 */
export const agentRunPageSchema = z.object({
  list: z.array(agentRunListItemSchema).nullish(),
  total: z.number().nullish(),
  pages: z.number().nullish(),
})
