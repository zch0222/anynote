/**
 * M20.5 Trace 归并、上下文 blob 还原与事件解析单测。
 */
import { describe, expect, it } from 'vitest'
import { actionItems, buildTraceTimeline, listToolCalls } from '~/lib/trace/buildTraceTimeline'
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

/** Harness TraceMiddleware 的真实 span 形状：只写结束时间，耗时在 attributes */
const HARNESS_BASE_NANO = 1_700_000_000_000_000_000
function harnessSpan(seq: number, type: string, name: string, attributes: object, endMs: number) {
  return parseTraceEvent({
    seq,
    type,
    content: {
      traceId: 'run-1',
      spanId: `s${seq}`,
      name,
      endTimeUnixNano: HARNESS_BASE_NANO + endMs * 1e6,
      attributes,
    },
  })
}

/** trace.visual 不带 span 包裹，内容直接是派遣记录 */
function harnessVisual(seq: number, modelTurn: number) {
  return parseTraceEvent({
    seq,
    type: 'trace.visual',
    content: { dispatchId: 'd1', runId: 'run-1', modelTurn, logicalModel: 'agent_main', providerKey: 'volc', model: 'm', images: [] },
  })
}

describe('buildTraceTimeline · Harness 真实事件形状', () => {
  it('上下文按 manifest.modelTurn 归入对应模型轮', () => {
    const events = [
      harnessSpan(1, 'trace.context', 'context.build', { manifest: { runId: 'run-1', modelTurn: 1, entries: [] } }, 50),
      harnessSpan(2, 'trace.model', 'model.call', { turn: 1, durationMs: 400 }, 450),
      harnessSpan(3, 'trace.action', 'action.execute', { actions: [{ callId: 'c1', tool: 'kb_search', durationMs: 300 }] }, 750),
      harnessSpan(4, 'trace.context', 'context.build', { manifest: { runId: 'run-1', modelTurn: 2, entries: [] } }, 800),
      harnessSpan(5, 'trace.model', 'model.call', { turn: 2, durationMs: 500 }, 1300),
      harnessSpan(6, 'trace.verify', 'result.verify', { passed: true }, 1310),
    ]
    const t = buildTraceTimeline(events)
    expect(t.rounds.map((r) => r.turn)).toEqual([1, 2])
    expect(t.rounds[0]!.contextEvent?.seq).toBe(1)
    expect(t.rounds[0]!.modelEvent?.seq).toBe(2)
    expect(t.rounds[1]!.contextEvent?.seq).toBe(4)
    expect(t.rounds[1]!.modelEvent?.seq).toBe(5)
    expect(t.rounds[1]!.verifyEvent?.seq).toBe(6)
    expect(t.eventCount).toBe(6)
  })

  it('视觉派遣按 modelTurn 归入目标模型轮', () => {
    const events = [
      harnessSpan(1, 'trace.model', 'model.call', { turn: 1, durationMs: 100 }, 100),
      harnessVisual(2, 2),
      harnessSpan(3, 'trace.model', 'model.call', { turn: 2, durationMs: 100 }, 300),
    ]
    const t = buildTraceTimeline(events)
    expect(t.rounds.map((r) => r.turn)).toEqual([1, 2])
    expect(t.rounds[0]!.visualEvents).toHaveLength(0)
    expect(t.rounds[1]!.visualEvents.map((e) => e.seq)).toEqual([2])
  })

  it('模型条用 durationMs 推导起点，并拆出首字前与生成两段', () => {
    const t = buildTraceTimeline([
      harnessSpan(1, 'trace.model', 'model.call', { turn: 1, durationMs: 1200, firstOutputMs: 300 }, 1200),
    ])
    expect(t.bars.map((b) => b.kind)).toEqual(['model-first-output', 'model-generation'])
    expect(t.bars[0]!.offsetMs).toBeCloseTo(0)
    expect(t.bars[0]!.durationMs).toBeCloseTo(300)
    expect(t.bars[1]!.offsetMs).toBeCloseTo(300)
    expect(t.bars[1]!.durationMs).toBeCloseTo(900)
    expect(t.totalDurationMs).toBeCloseTo(1200)
  })

  it('模型无首字时间时只出一条完整时长的条', () => {
    const t = buildTraceTimeline([
      harnessSpan(1, 'trace.model', 'model.call', { turn: 1, durationMs: 800 }, 1800),
    ])
    // 单个事件的推导起点即整场起点
    expect(t.bars).toHaveLength(1)
    expect(t.bars[0]!.kind).toBe('event')
    expect(t.bars[0]!.offsetMs).toBeCloseTo(0)
    expect(t.bars[0]!.durationMs).toBeCloseTo(800)
    expect(t.totalDurationMs).toBeCloseTo(800)
  })

  it('工具按每次调用出条，起点取整批开始', () => {
    const t = buildTraceTimeline([
      harnessSpan(1, 'trace.model', 'model.call', { turn: 1, durationMs: 1000 }, 1000),
      harnessSpan(2, 'trace.action', 'action.execute', {
        actions: [
          { callId: 'c1', tool: 'kb_search', durationMs: 400 },
          { callId: 'c2', tool: 'kb_read', durationMs: 600 },
        ],
      }, 2000),
    ])
    expect(t.bars.map((b) => b.kind)).toEqual(['event', 'tool', 'tool'])
    expect(t.bars.slice(1).map((b) => b.label)).toEqual(['工具·kb_search', '工具·kb_read'])
    // 整批 1400–2000，两个调用同时开始
    expect(t.bars[1]!.offsetMs).toBeCloseTo(1400)
    expect(t.bars[1]!.durationMs).toBeCloseTo(400)
    expect(t.bars[2]!.offsetMs).toBeCloseTo(1400)
    expect(t.bars[2]!.durationMs).toBeCloseTo(600)
    expect(t.bars.slice(1).map((b) => b.actionIndex)).toEqual([0, 1])
    expect(t.totalDurationMs).toBeCloseTo(2000)
  })

  it('工具调用数按 actions 条数统计', () => {
    const t = buildTraceTimeline([
      harnessSpan(1, 'trace.model', 'model.call', { turn: 1, durationMs: 100 }, 100),
      harnessSpan(2, 'trace.action', 'action.execute', {
        actions: [
          { callId: 'c1', tool: 'kb_search', durationMs: 400 },
          { callId: 'c2', tool: 'kb_read', durationMs: 600 },
        ],
      }, 700),
    ])
    expect(t.rounds).toHaveLength(1)
    expect(t.rounds[0]!.toolCalls).toBe(2)
    expect(t.rounds[0]!.actionEvents).toHaveLength(1)
  })

  it('只有结束时间且无耗时字段的事件为零时长点', () => {
    const t = buildTraceTimeline([harnessSpan(1, 'trace.state', 'state.transition', { state: 'RUNNING' }, 120)])
    expect(t.bars).toHaveLength(1)
    expect(t.bars[0]!.offsetMs).toBeCloseTo(0)
    expect(t.bars[0]!.durationMs).toBe(0)
    expect(t.totalDurationMs).toBe(0)
  })
})

describe('resolveContextBlobs · Harness 真实事件形状', () => {
  const entry = {
    sourceType: 'platform', sourceId: 'platform-rules', scope: 'platform', version: '1',
    trustLevel: 'PLATFORM', selectedReason: '平台规则', tokenCount: 3, transform: 'ORIGINAL', contentHash: 'h1',
  }
  const first = harnessSpan(1, 'trace.context', 'context.build', {
    manifest: { runId: 'run-1', modelTurn: 1, entries: [entry] },
    blobs: [{ hash: 'h1', content: '平台规则原文' }],
  }, 50)
  // 同一哈希整场运行只写一次：第二轮清单引用 h1 但不带 blobs
  const second = harnessSpan(2, 'trace.context', 'context.build', {
    manifest: { runId: 'run-1', modelTurn: 2, entries: [entry] },
  }, 800)

  it('从 trace.context.attributes.blobs 建立运行级哈希索引，跨轮还原原文', () => {
    const index = buildBlobIndex([first, second])
    const resolved = resolveContextEntries(parseContextManifest(second), index)
    expect(resolved[0]!.content).toBe('平台规则原文')
    expect(resolved[0]!.missing).toBe(false)
    expect(resolved[0]!.tokenCount).toBe(3)
  })

  it('清单引用的哈希在整场运行里都没写入时标记缺失', () => {
    const index = buildBlobIndex([second])
    const resolved = resolveContextEntries(parseContextManifest(second), index)
    expect(resolved[0]!.missing).toBe(true)
    expect(resolved[0]!.missingReason).toBe('该层上下文原文缺失或哈希未登记')
  })
})

describe('listToolCalls', () => {
  it('按单次调用展开工具事件，保留轮次、工具名与调用记录', () => {
    const t = buildTraceTimeline([
      harnessSpan(1, 'trace.model', 'model.call', { turn: 1, durationMs: 100 }, 100),
      harnessSpan(2, 'trace.action', 'action.execute', {
        actions: [
          { callId: 'c1', tool: 'kb_search', status: 'SUCCESS', durationMs: 400 },
          { callId: 'c2', tool: 'kb_read', status: 'FAILED', durationMs: 600 },
        ],
      }, 700),
    ])
    const calls = listToolCalls(t.rounds)
    expect(calls.map((call) => [call.key, call.turn, call.tool])).toEqual([
      ['2:0', 1, 'kb_search'],
      ['2:1', 1, 'kb_read'],
    ])
    expect(calls[0]!.value).toMatchObject({ callId: 'c1', status: 'SUCCESS', durationMs: 400 })
    expect(calls[1]!.value).toMatchObject({ callId: 'c2', status: 'FAILED' })
  })

  it('调用缺少工具名时回落为事件名', () => {
    const t = buildTraceTimeline([
      harnessSpan(1, 'trace.action', 'action.execute', { actions: [{ callId: 'c1', durationMs: 10 }] }, 20),
    ])
    expect(listToolCalls(t.rounds)[0]!.tool).toBe('action.execute')
  })

  it('事件没有 actions 时整条事件的 attributes 作为一条记录', () => {
    const t = buildTraceTimeline([
      ev(1, 'trace.action', { name: 'action.execute', attributes: { turn: 1 }, startTimeUnixNano: 0, endTimeUnixNano: 1e6 }),
    ])
    const calls = listToolCalls(t.rounds)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ key: '1', turn: 1, tool: 'action.execute', isCall: false })
    expect(calls[0]!.value).toEqual({ turn: 1 })
  })

  it('没有工具事件时为空数组', () => {
    expect(listToolCalls(buildTraceTimeline([]).rounds)).toEqual([])
  })
})

describe('actionItems', () => {
  it('只保留对象条目，形状不符时为空数组', () => {
    const event = harnessSpan(1, 'trace.action', 'action.execute', { actions: [{ callId: 'c1' }, null, 'x', 3] }, 1)
    expect(actionItems(event)).toEqual([{ callId: 'c1' }])
    expect(actionItems(harnessSpan(2, 'trace.action', 'action.execute', {}, 1))).toEqual([])
    expect(actionItems(harnessSpan(3, 'trace.model', 'model.call', { actions: 'bad' }, 1))).toEqual([])
  })
})
