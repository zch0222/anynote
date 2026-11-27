/**
 * M20.5 Trace 归并、上下文 blob 还原与事件解析单测。
 */
import { describe, expect, it } from 'vitest'
import { buildTraceTimeline } from '~/lib/trace/buildTraceTimeline'
import { buildBlobIndex, parseContextManifest, resolveContextEntries } from '~/lib/trace/resolveContextBlobs'
import { parseTraceEvent } from '~/lib/schemas/agent-trace'

function ev(seq: number, type: string, span: object) {
  return parseTraceEvent({ seq, type, content: JSON.stringify(span) })
}
const NANO = 1e9

describe('parseTraceEvent', () => {
  it('解析合法 JSON 与容错非法内容', () => {
    expect(parseTraceEvent({ seq: 1, type: 'trace.model', content: '{"a":1}' }).span).toEqual({ a: 1 })
    expect(parseTraceEvent({ seq: 2, type: 'x', content: 'not-json' }).span).toEqual({})
    expect(parseTraceEvent({ seq: 3, type: 'x', content: null }).span).toEqual({})
  })
})

describe('buildTraceTimeline', () => {
  const events = [
    ev(1, 'trace.context', { attributes: { turn: 1 }, startTimeUnixNano: 0, endTimeUnixNano: 0.1 * NANO }),
    ev(2, 'trace.model', { attributes: { turn: 1, usage: { totalTokens: 30, promptTokens: 20 } }, startTimeUnixNano: 0.1 * NANO, endTimeUnixNano: 1.5 * NANO }),
    ev(3, 'trace.action', { attributes: { turn: 1 }, startTimeUnixNano: 1.5 * NANO, endTimeUnixNano: 2 * NANO }),
    ev(4, 'trace.model', { attributes: { turn: 2, usage: { totalTokens: 50 } }, startTimeUnixNano: 2 * NANO, endTimeUnixNano: 3 * NANO }),
    ev(5, 'trace.verify', { attributes: { turn: 2, passed: true }, endTimeUnixNano: 3.1 * NANO }),
  ]

  it('按 turn 分轮并提取用量', () => {
    const t = buildTraceTimeline(events)
    expect(t.rounds.map((r) => r.turn)).toEqual([1, 2])
    expect(t.rounds[0]!.usage?.totalTokens).toBe(30)
    expect(t.rounds[0]!.toolCalls).toBe(1)
    expect(t.rounds[1]!.verifyPassed).toBe(true)
    expect(t.eventCount).toBe(5)
  })

  it('瀑布条毫秒换算与排序容错', () => {
    const t = buildTraceTimeline([...events].reverse())
    expect(t.bars).toHaveLength(5)
    const model = t.bars.find((b) => b.event.type === 'trace.model')!
    expect(model.durationMs).toBeCloseTo(1400, 0)
    expect(t.totalDurationMs).toBeCloseTo(3100, 0)
  })

  it('缺失时间字段退化为零时长不报错', () => {
    const t = buildTraceTimeline([ev(1, 'trace.state', {})])
    expect(t.bars[0]!.durationMs).toBe(0)
  })
})

describe('resolveContextBlobs', () => {
  const contextEvent = ev(1, 'trace.context', {
    attributes: { manifest: { entries: [
      { scope: 'platform', sourceType: 'rules', transform: 'ORIGINAL', contentHash: 'h1', charCount: 10 },
      { scope: 'user', sourceType: 'note', transform: 'ORIGINAL', contentHash: 'h2' },
      { scope: 'x', transform: 'ORIGINAL' },
    ] } },
  })
  const blobEvent = ev(2, 'trace.blob', { attributes: { contentHash: 'h1', content: '平台规则原文' } })

  it('命中 blob 表还原原文，缺失哈希标记缺省文案', () => {
    const entries = parseContextManifest(contextEvent)
    expect(entries).toHaveLength(3)
    const index = buildBlobIndex([contextEvent, blobEvent])
    const resolved = resolveContextEntries(entries, index)
    expect(resolved[0]!.content).toBe('平台规则原文')
    expect(resolved[0]!.missing).toBe(false)
    expect(resolved[1]!.missing).toBe(true)
    expect(resolved[1]!.missingReason).toBe('该层上下文原文缺失或哈希未登记')
    expect(resolved[2]!.missing).toBe(true)
  })

  it('无 context 事件时返回空数组', () => {
    expect(parseContextManifest(undefined)).toEqual([])
  })
})

describe('buildTraceTimeline 复杂边界', () => {
  it('模型中断重试：同 turn 两次 model 事件归入同轮', () => {
    const events = [
      ev(1, 'trace.model', { attributes: { turn: 1 }, endTimeUnixNano: 1e9 }),
      ev(2, 'trace.model', { attributes: { turn: 1, usage: { totalTokens: 80 } }, endTimeUnixNano: 2e9 }),
    ]
    const t = buildTraceTimeline(events)
    expect(t.rounds).toHaveLength(1)
    expect(t.rounds[0]!.events).toHaveLength(2)
  })

  it('缺失 turn 的事件归入当前轮（补偿逻辑不丢事件）', () => {
    const events = [
      ev(1, 'trace.model', { attributes: { turn: 1 }, endTimeUnixNano: 1e9 }),
      ev(2, 'trace.state', { attributes: {}, endTimeUnixNano: 1.1e9 }),
      ev(3, 'trace.action', { attributes: {}, endTimeUnixNano: 1.2e9 }),
    ]
    const t = buildTraceTimeline(events)
    const all = t.rounds.flatMap((r) => r.events)
    expect(all).toHaveLength(3)
    expect(t.rounds[0]!.toolCalls).toBe(1)
  })

  it('空事件列表产出空时间线', () => {
    const t = buildTraceTimeline([])
    expect(t.rounds).toHaveLength(0)
    expect(t.totalDurationMs).toBe(0)
    expect(t.eventCount).toBe(0)
  })

  it('verify 未通过时正确暴露 failed 状态', () => {
    const t = buildTraceTimeline([
      ev(1, 'trace.verify', { attributes: { turn: 1, passed: false }, endTimeUnixNano: 1e9 }),
    ])
    expect(t.rounds[0]!.verifyPassed).toBe(false)
  })
})
