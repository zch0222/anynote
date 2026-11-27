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
  type StatsWindowKey,
} from '~/lib/schemas/agent-stats'

export function useAgentRunStats(windowKey: Ref<StatsWindowKey>) {
  const params = computed(() => resolveStatsWindow(windowKey.value))
  return useQuery({
    queryKey: computed(() => queryKeys.agentRunStats({ window: windowKey.value })),
    queryFn: async ({ signal }) => {
      const { response } = await aiClient.GET('/v1/admin/agent-runs/stats', {
        params: { query: params.value },
        parseAs: 'stream',
        signal,
      })
      return unwrapEnvelope(response, agentRunStatsSchema.parse)
    },
  })
}

/** 非成功终态 outcome 集合（与后端 harness 落库值对齐） */
export const ABNORMAL_OUTCOMES = new Set(['FAILED', 'CANCELLED'])

/** 最近异常运行速览：拉取窗口内最新 50 条并前端过滤非成功终态，取前 10 条 */
export function useRecentFailedRuns(windowKey: Ref<StatsWindowKey>) {
  const params = computed(() => resolveStatsWindow(windowKey.value))
  return useQuery({
    queryKey: computed(() => queryKeys.agentRuns({ recentFailed: true, window: windowKey.value })),
    queryFn: async ({ signal }) => {
      const { response } = await aiClient.GET('/v1/admin/agent-runs', {
        params: {
          query: {
            pageNum: 1,
            pageSize: 50,
            startedFrom: params.value.startedFrom,
            startedTo: params.value.startedTo,
          },
        },
        parseAs: 'stream',
        signal,
      })
      const page = await unwrapEnvelope(response, agentRunPageSchema.parse)
      return (page.list ?? [])
        .filter((run) => run.outcome != null && ABNORMAL_OUTCOMES.has(run.outcome))
        .slice(0, 10)
    },
  })
}
