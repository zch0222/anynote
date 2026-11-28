/**
 * 概览看板统计与运行列表 composable 单测：分页字段、时间窗推进、近期异常运行取法与合并。
 *
 * @author 称霸幼儿园
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mergeRecentAbnormalRuns, useAgentRunStats, useRecentFailedRuns } from '~/composables/ai/useAgentRunStats'
import { useAgentRuns } from '~/composables/ai/useAgentRuns'
import { aiClient } from '~/lib/api/client'
import { runWithQueryClient } from '../vue-query'

vi.mock('~/lib/api/client', () => ({ aiClient: { GET: vi.fn() } }))

const mockedGet = vi.mocked(aiClient.GET)

type WindowKey = '24h' | '7d' | '30d'

/** 后端 ResData 信封的成功响应 */
function okResponse(data: unknown) {
  return {
    response: new Response(JSON.stringify({ code: '00000', msg: '操作成功', data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  }
}

/** 每次调用都返回一个新的成功响应（响应体只能读一次） */
function mockOkPages(data: unknown) {
  mockedGet.mockImplementation(() => okResponse(data) as never)
}

function runItem(runId: string, outcome: string, startedAt: string) {
  return { runId, outcome, startedAt, provider: 'volc', model: 'm', durationMs: 10 }
}

/** 2026-11-27 第 minute 分钟开始的运行 */
function at(minute: number) {
  return new Date(Date.UTC(2026, 10, 27, 0, minute)).toISOString()
}

let disposers: Array<() => void> = []

/** 在带 QueryClient 的作用域内执行 composable */
function run<T>(fn: () => T): T {
  const wrapped = runWithQueryClient(fn)
  disposers.push(wrapped.dispose)
  return wrapped.result
}

/** composable 创建时即发起请求，之后每次 refetch 再请求一轮 */
function queriesOfCalls() {
  return mockedGet.mock.calls.map((call) => call[1].params.query)
}

beforeEach(() => {
  mockedGet.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-27T12:00:00Z'))
})

afterEach(() => {
  for (const dispose of disposers) dispose()
  disposers = []
  vi.useRealTimers()
})

describe('useAgentRunStats', () => {
  it('按时间窗请求统计接口，切换窗口后使用新的区间', async () => {
    mockOkPages({ totalRuns: 0 })
    const windowKey = ref<WindowKey>('24h')
    const stats = run(() => useAgentRunStats(windowKey))

    await stats.suspense()
    expect(queriesOfCalls()[0]).toEqual({
      startedFrom: '2026-11-26T12:00:00.000Z',
      startedTo: '2026-11-27T12:00:00.000Z',
      granularity: 'HOUR',
    })

    windowKey.value = '7d'
    await stats.suspense()
    expect(queriesOfCalls()[1]).toMatchObject({ startedFrom: '2026-11-20T12:00:00.000Z', granularity: 'DAY' })
  })

  it('刷新时重新计算时间窗，纳入页面打开后新增的运行', async () => {
    mockOkPages({ totalRuns: 0 })
    const stats = run(() => useAgentRunStats(ref<WindowKey>('24h')))

    await stats.suspense()
    vi.setSystemTime(new Date('2026-11-27T12:05:00Z'))
    await stats.refetch()

    const queries = queriesOfCalls()
    expect(queries).toHaveLength(2)
    expect(queries[1]).toMatchObject({
      startedFrom: '2026-11-26T12:05:00.000Z',
      startedTo: '2026-11-27T12:05:00.000Z',
    })
  })
})

describe('useRecentFailedRuns', () => {
  it('按后端分页字段 rows 读取异常运行', async () => {
    mockedGet.mockImplementation((_, init) => okResponse({
      current: 1,
      pages: 1,
      total: init?.params?.query?.outcome === 'FAILED' ? 2 : 1,
      rows: init?.params?.query?.outcome === 'FAILED'
        ? [runItem('f1', 'FAILED', at(9)), runItem('f0', 'FAILED', at(8))]
        : [runItem('c1', 'CANCELLED', at(7))],
    }) as never)
    const recent = run(() => useRecentFailedRuns(ref<WindowKey>('7d')))

    const data = (await recent.suspense()).data
    expect(data.map((item) => item.runId)).toEqual(['f1', 'f0', 'c1'])
    expect(mockedGet.mock.calls[0]![0]).toBe('/v1/admin/agent-runs')
  })

  it('由后端按 outcome 分别筛选失败与已取消，合并后按开始时间倒序取前 10 条', async () => {
    const odds = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    const evens = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
    mockedGet.mockImplementation((path, init) => {
      const failed = init?.params?.query?.outcome === 'FAILED'
      const rows = (failed ? odds.map((m) => runItem(`f${m}`, 'FAILED', at(m))) : evens.map((m) => runItem(`c${m}`, 'CANCELLED', at(m))))
      return okResponse({ current: 1, pages: 1, total: 10, rows }) as never
    })
    const recent = run(() => useRecentFailedRuns(ref<WindowKey>('7d')))

    const data = (await recent.suspense()).data

    const queries = queriesOfCalls()
    expect(queries.map((query) => query.outcome)).toEqual(['FAILED', 'CANCELLED'])
    for (const query of queries) {
      expect(query).toMatchObject({
        pageNum: 1,
        pageSize: 10,
        startedFrom: '2026-11-20T12:00:00.000Z',
        startedTo: '2026-11-27T12:00:00.000Z',
      })
    }
    expect(data.map((item) => item.runId)).toEqual(['c20', 'f19', 'c18', 'f17', 'c16', 'f15', 'c14', 'f13', 'c12', 'f11'])
  })

  it('窗口内较早的失败运行不会被更新的运行挤出', async () => {
    // 最新 60 条都是别的结果，只有第 1 分钟有一条失败：整页截取再筛选会漏掉它
    mockedGet.mockImplementation((_, init) => {
      const rows = init?.params?.query?.outcome === 'FAILED' ? [runItem('f1', 'FAILED', at(1))] : []
      return okResponse({ total: rows.length, rows }) as never
    })
    const recent = run(() => useRecentFailedRuns(ref<WindowKey>('7d')))

    const data = (await recent.suspense()).data
    expect(data.map((item) => item.runId)).toEqual(['f1'])
  })

  it('没有异常运行时为空数组', async () => {
    mockOkPages({ total: 0, rows: [] })
    const recent = run(() => useRecentFailedRuns(ref<WindowKey>('30d')))

    const data = (await recent.suspense()).data
    expect(data).toEqual([])
    expect(mockedGet).toHaveBeenCalledTimes(2)
  })

  it('其中一个 outcome 查询失败时整体进入错误态', async () => {
    mockedGet.mockImplementation((_, init) => (init?.params?.query?.outcome === 'FAILED'
      ? okResponse({ total: 0, rows: [] })
      : {
          response: new Response(JSON.stringify({ code: 'A0301', msg: '只有系统管理员可以访问管理接口' }), { status: 200 }),
        }) as never)
    const recent = run(() => useRecentFailedRuns(ref<WindowKey>('7d')))

    const result = await recent.suspense()
    expect(result.isError).toBe(true)
    expect(result.error).toMatchObject({ code: 'A0301' })
  })

  it('刷新时重新计算时间窗', async () => {
    mockOkPages({ total: 0, rows: [] })
    const recent = run(() => useRecentFailedRuns(ref<WindowKey>('24h')))

    await recent.suspense()
    vi.setSystemTime(new Date('2026-11-27T12:10:00Z'))
    await recent.refetch()

    const queries = queriesOfCalls()
    const firstRound = queries.length / 2
    expect(firstRound).toBeGreaterThan(0)
    expect(queries.slice(0, firstRound).every((query) => query.startedTo === '2026-11-27T12:00:00.000Z')).toBe(true)
    expect(queries.slice(firstRound).every((query) => query.startedTo === '2026-11-27T12:10:00.000Z')).toBe(true)
  })
})

describe('mergeRecentAbnormalRuns', () => {
  it('按开始时间倒序合并并截断到上限', () => {
    const failed = [runItem('f3', 'FAILED', at(30)), runItem('f1', 'FAILED', at(10))]
    const cancelled = [runItem('c2', 'CANCELLED', at(20))]
    expect(mergeRecentAbnormalRuns(failed, cancelled, 2).map((item) => item.runId)).toEqual(['f3', 'c2'])
    expect(mergeRecentAbnormalRuns(failed, cancelled).map((item) => item.runId)).toEqual(['f3', 'c2', 'f1'])
  })

  it('开始时间无法解析的运行排在最后', () => {
    const failed = [runItem('f-bad', 'FAILED', 'not-a-date')]
    const cancelled = [runItem('c1', 'CANCELLED', at(20))]
    expect(mergeRecentAbnormalRuns(failed, cancelled).map((item) => item.runId)).toEqual(['c1', 'f-bad'])
  })

  it('不改动入参数组的顺序', () => {
    const failed = [runItem('f1', 'FAILED', at(10)), runItem('f3', 'FAILED', at(30))]
    mergeRecentAbnormalRuns(failed, [])
    expect(failed.map((item) => item.runId)).toEqual(['f1', 'f3'])
  })
})

describe('useAgentRuns', () => {
  it('运行列表按后端分页字段 rows 读取，筛选条件透传', async () => {
    mockedGet.mockImplementation(() => okResponse({
      current: 2,
      pages: 3,
      total: 41,
      rows: [{ ...runItem('r1', 'ANSWERED', at(5)), userId: 7, conversationId: 9, state: 'COMPLETED', firstOutputMs: 120 }],
    }) as never)
    const runs = run(() => useAgentRuns({ outcome: 'ANSWERED', page: 2, pageSize: 20 }))

    const data = (await runs.suspense()).data
    expect(data?.rows?.map((item) => item.runId)).toEqual(['r1'])
    expect(data?.rows?.[0]).toMatchObject({ userId: 7, conversationId: 9, firstOutputMs: 120 })
    expect(data?.total).toBe(41)
    expect(queriesOfCalls()[0]).toMatchObject({ outcome: 'ANSWERED', pageNum: 2, pageSize: 20 })
  })
})
