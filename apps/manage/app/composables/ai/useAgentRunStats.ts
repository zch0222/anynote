/**
 * 概览看板统计查询：对接 GET /v1/admin/agent-runs/stats（经 BFF 代理）。
 */
import { useQuery } from '@tanstack/vue-query'
import { unwrapEnvelope } from '@anynote/api-core'
import { aiClient } from '~/lib/api/client'
import { queryKeys } from '~/lib/api/query-keys'
import {
  agentRunPageSchema,
  agentRunStatsSchema,
  resolveStatsWindow,
  type AgentRunListItem,
  type StatsWindowKey,
} from '~/lib/schemas/agent-stats'

export function useAgentRunStats(windowKey: Ref<StatsWindowKey>) {
  return useQuery({
    queryKey: computed(() => queryKeys.agentRunStats({ window: windowKey.value })),
    queryFn: async ({ signal }) => {
      // 时间窗在每次请求时重新计算，刷新后才会纳入页面打开后新增的运行
      const params = resolveStatsWindow(windowKey.value)
      const { response } = await aiClient.GET('/v1/admin/agent-runs/stats', {
        params: { query: params },
        parseAs: 'stream',
        signal,
      })
      return unwrapEnvelope(response, agentRunStatsSchema.parse)
    },
  })
}

/** 非成功终态 outcome 集合（与后端 harness 落库值对齐） */
export const ABNORMAL_OUTCOMES = ['FAILED', 'CANCELLED'] as const

/** 近期异常运行速览最多展示的条数 */
export const RECENT_ABNORMAL_LIMIT = 10

/** 开始时间的毫秒时间戳，无法解析时按 0 处理 */
function startedAtMs(value: string | null | undefined): number {
  const ms = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(ms) ? ms : 0
}

/**
 * 合并失败与已取消两组运行，按开始时间倒序取前 limit 条。
 * @param failed 失败运行
 * @param cancelled 已取消运行
 * @param limit 最多保留条数
 * @return 合并后的运行列表
 */
export function mergeRecentAbnormalRuns(
  failed: AgentRunListItem[],
  cancelled: AgentRunListItem[],
  limit = RECENT_ABNORMAL_LIMIT,
): AgentRunListItem[] {
  return [...failed, ...cancelled]
    .sort((a, b) => startedAtMs(b.startedAt) - startedAtMs(a.startedAt))
    .slice(0, limit)
}

/** 近期异常运行速览：由后端按 outcome 分别筛选失败与已取消，各取最新 10 条后合并取前 10 条 */
export function useRecentFailedRuns(windowKey: Ref<StatsWindowKey>) {
  return useQuery({
    queryKey: computed(() => queryKeys.agentRuns({ recentFailed: true, window: windowKey.value })),
    queryFn: async ({ signal }) => {
      // 时间窗在每次请求时重新计算
      const params = resolveStatsWindow(windowKey.value)
      const pages = await Promise.all(
        ABNORMAL_OUTCOMES.map(async (outcome) => {
          const { response } = await aiClient.GET('/v1/admin/agent-runs', {
            params: {
              query: {
                pageNum: 1,
                pageSize: RECENT_ABNORMAL_LIMIT,
                outcome,
                startedFrom: params.startedFrom,
                startedTo: params.startedTo,
              },
            },
            parseAs: 'stream',
            signal,
          })
          return unwrapEnvelope(response, agentRunPageSchema.parse)
        }),
      )
      return mergeRecentAbnormalRuns(pages[0]?.rows ?? [], pages[1]?.rows ?? [])
    },
  })
}
