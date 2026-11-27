/**
 * Trace 事件归并：按 seq 排序，按 model 轮次（turn）分轮，
 * 并产出瀑布图所需的相对时间条。纯函数，供组件与单测复用。
 */
import type { ParsedTraceEvent } from '~/lib/schemas/agent-trace'

export interface TraceRound {
  turn: number
  events: ParsedTraceEvent[]
  contextEvent?: ParsedTraceEvent
  modelEvent?: ParsedTraceEvent
  actionEvents: ParsedTraceEvent[]
  verifyEvent?: ParsedTraceEvent
  visualEvents: ParsedTraceEvent[]
  /** 模型调用 token 用量（attributes.usage） */
  usage?: { promptTokens?: number, completionTokens?: number, totalTokens?: number }
  toolCalls: number
  verifyPassed?: boolean
}

export interface TimelineBar {
  event: ParsedTraceEvent
  /** 相对整场运行起点的毫秒偏移 */
  offsetMs: number
  durationMs: number
}

export interface TraceTimeline {
  rounds: TraceRound[]
  bars: TimelineBar[]
  totalDurationMs: number
  /** 事件总数（用于截断提示与统计） */
  eventCount: number
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function spanEnd(e: ParsedTraceEvent): number | undefined {
  return num(e.span.endTimeUnixNano)
}
function spanStart(e: ParsedTraceEvent): number | undefined {
  return num(e.span.startTimeUnixNano)
}

/** 事件归并主入口：输入原始解析事件（任意顺序），输出分轮与时间条 */
export function buildTraceTimeline(events: ParsedTraceEvent[]): TraceTimeline {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const roundMap = new Map<number, TraceRound>()
  let currentTurn = 0

  const ensureRound = (turn: number): TraceRound => {
    let round = roundMap.get(turn)
    if (!round) {
      round = { turn, events: [], actionEvents: [], visualEvents: [], toolCalls: 0 }
      roundMap.set(turn, round)
    }
    return round
  }

  for (const event of sorted) {
    const attrs = event.span.attributes ?? {}
    const turn = num(attrs.turn) ?? (event.type === 'trace.model' ? currentTurn + 1 : currentTurn)
    if (event.type === 'trace.model' && num(attrs.turn) == null) currentTurn = turn
    if (num(attrs.turn) != null) currentTurn = Math.max(currentTurn, num(attrs.turn) ?? 0)
    const round = ensureRound(turn)
    round.events.push(event)
    switch (event.type) {
      case 'trace.context':
        round.contextEvent = event
        break
      case 'trace.model':
        round.modelEvent = event
        if (attrs.usage && typeof attrs.usage === 'object') {
          const u = attrs.usage as Record<string, unknown>
          round.usage = {
            promptTokens: num(u.promptTokens),
            completionTokens: num(u.completionTokens),
            totalTokens: num(u.totalTokens),
          }
        }
        break
      case 'trace.action':
        round.actionEvents.push(event)
        round.toolCalls += 1
        break
      case 'trace.verify':
        round.verifyEvent = event
        round.verifyPassed = attrs.passed === true
        break
      case 'trace.visual':
        round.visualEvents.push(event)
        break
    }
  }

  const rounds = [...roundMap.values()].sort((a, b) => a.turn - b.turn)

  // 瀑布条：优先 span 起止时间，缺失时退化为零时长点（仍按 seq 展示）
  const nanoTimes = sorted
    .map((e) => spanStart(e) ?? spanEnd(e))
    .filter((t): t is number => t != null)
  const baseNano = nanoTimes.length ? Math.min(...nanoTimes) : 0
  let lastEndMs = 0
  const bars: TimelineBar[] = sorted.map((event) => {
    const end = spanEnd(event)
    const start = spanStart(event)
    let offsetMs: number
    let durationMs: number
    if (end != null) {
      const endMs = (end - baseNano) / 1e6
      durationMs = start != null ? Math.max((end - start) / 1e6, 0) : 0
      offsetMs = endMs - durationMs
    } else {
      offsetMs = lastEndMs
      durationMs = 0
    }
    lastEndMs = Math.max(lastEndMs, offsetMs + durationMs)
    return { event, offsetMs, durationMs }
  })

  return { rounds, bars, totalDurationMs: lastEndMs, eventCount: sorted.length }
}
