/**
 * Agent 运行管理数据层：筛选列表、详情、事件自动翻页加载（硬上限 5000）。
 */
import { useQuery } from '@tanstack/vue-query'
import { unwrapEnvelope } from '@anynote/api-core'
import { z } from 'zod'
import { aiClient } from '~/lib/api/client'
import { queryKeys } from '~/lib/api/query-keys'
import { agentRunPageSchema } from '~/lib/schemas/agent-stats'
import { agentRunDetailSchema, agentRunEventSchema, parseTraceEvent, type ParsedTraceEvent } from '~/lib/schemas/agent-trace'

export const EVENT_HARD_LIMIT = 5000

export interface RunListFilters {
  runId?: string
  userId?: string
  outcome?: string
  page?: number
  pageSize?: number
}

export function useAgentRuns(filters: MaybeRefOrGetter<RunListFilters>) {
  return useQuery({
    queryKey: computed(() => queryKeys.agentRuns(toValue(filters) as unknown as Record<string, unknown>)),
    queryFn: async ({ signal }) => {
      const f = toValue(filters)
      const { response } = await aiClient.GET('/v1/admin/agent-runs', {
        params: { query: {
          runId: f.runId || undefined,
          userId: f.userId ? Number(f.userId) : undefined,
          outcome: f.outcome || undefined,
          pageNum: f.page ?? 1,
          pageSize: f.pageSize ?? 20,
        } as never },
        parseAs: 'stream',
        signal,
      })
      return unwrapEnvelope(response, agentRunPageSchema.parse)
    },
  })
}

export function useAgentRunDetail(runId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.agentRun(toValue(runId))),
    queryFn: async ({ signal }) => {
      const { response } = await aiClient.GET('/v1/admin/agent-runs/{runId}', {
        params: { path: { runId: toValue(runId) } },
        parseAs: 'stream',
        signal,
      })
      return unwrapEnvelope(response, agentRunDetailSchema.parse)
    },
  })
}

export interface TraceEventsResult {
  events: ParsedTraceEvent[]
  truncated: boolean
  loaded: number
}

/** 事件自动翻页：afterSeq 游标拉取直到耗尽或达到硬上限 */
export function useAgentRunEvents(runId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.agentRunEvents(toValue(runId))),
    queryFn: async ({ signal }) => {
      const id = toValue(runId)
      const events: ParsedTraceEvent[] = []
      let afterSeq: number | undefined
      let truncated = false
      for (;;) {
        const { response } = await aiClient.GET('/v1/admin/agent-runs/{runId}/events', {
          params: { path: { runId: id }, query: { afterSeq, limit: 500 } as never },
          parseAs: 'stream',
          signal,
        })
        const rows = await unwrapEnvelope(response, (v) => z.array(agentRunEventSchema).parse(v))
        if (!rows.length) break
        for (const row of rows) events.push(parseTraceEvent(row))
        if (events.length >= EVENT_HARD_LIMIT) {
          truncated = true
          break
        }
        if (rows.length < 500) break
        afterSeq = rows[rows.length - 1]!.seq
      }
      return { events, truncated, loaded: events.length } satisfies TraceEventsResult
    },
    staleTime: 60_000,
  })
}
