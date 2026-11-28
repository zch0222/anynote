/**
 * Trace 事件归并：按 seq 排序，按模型轮次（turn）分轮，
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

/** trace.action 的一条工具调用记录（attributes.actions 的元素） */
export interface TraceAction {
  callId?: string
  tool?: string
  status?: string
  durationMs?: number
  [key: string]: unknown
}

/** 瀑布条类型：模型首字前等待、模型流式生成、单次工具调用，其余为普通事件 */
export type TimelineBarKind = 'event' | 'model-first-output' | 'model-generation' | 'tool'

export interface TimelineBar {
  event: ParsedTraceEvent
  /** 相对整场运行起点的毫秒偏移 */
  offsetMs: number
  durationMs: number
  kind: TimelineBarKind
  /** 展示标签：模型阶段名或工具名，其余为事件类型 */
  label: string
  /** 工具条对应 attributes.actions 的下标 */
  actionIndex?: number
}

export interface TraceTimeline {
  rounds: TraceRound[]
  bars: TimelineBar[]
  totalDurationMs: number
  /** 事件总数（用于截断提示与统计） */
  eventCount: number
}

const MODEL_FIRST_OUTPUT_LABEL = '模型·首字前'
const MODEL_GENERATION_LABEL = '模型·生成'
const TOOL_LABEL_PREFIX = '工具·'

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function spanEnd(e: ParsedTraceEvent): number | undefined {
  return num(e.span.endTimeUnixNano)
}
function spanStart(e: ParsedTraceEvent): number | undefined {
  return num(e.span.startTimeUnixNano)
}

/** 读取 trace.action 事件的工具调用条目，形状不符时为空数组 */
export function actionItems(event: ParsedTraceEvent): TraceAction[] {
  const actions = event.span.attributes?.actions
  if (!Array.isArray(actions)) return []
  return actions.filter((item): item is TraceAction => item != null && typeof item === 'object')
}

/** 工具诊断的一条记录：一次工具调用，或没有 actions 时整条工具事件的 attributes */
export interface ToolCallEntry {
  /** 记录键：事件 seq 加 actions 下标 */
  key: string
  turn: number
  /** 工具名；调用没有工具名或事件没有 actions 时为 span 名 */
  tool: string
  value: TraceAction | Record<string, unknown>
  /** 是否为单次调用记录 */
  isCall: boolean
}

/**
 * 按单次调用展开各轮的工具事件，供检查器逐条展示。
 * @param rounds 分轮结果
 * @return 工具调用记录，按轮次与事件顺序排列
 */
export function listToolCalls(rounds: TraceRound[]): ToolCallEntry[] {
  return rounds.flatMap((round) =>
    round.actionEvents.flatMap((event): ToolCallEntry[] => {
      const fallbackTool = event.span.name ?? event.type
      const actions = actionItems(event)
      if (!actions.length) {
        return [{
          key: String(event.seq),
          turn: round.turn,
          tool: fallbackTool,
          value: event.span.attributes ?? {},
          isCall: false,
        }]
      }
      return actions.map((action, index) => ({
        key: `${event.seq}:${index}`,
        turn: round.turn,
        tool: typeof action.tool === 'string' && action.tool ? action.tool : fallbackTool,
        value: action,
        isCall: true,
      }))
    }),
  )
}

/**
 * 解析事件所属的模型轮。
 * @param event Trace 事件
 * @param currentTurn 此前已到达的模型轮
 * @return 模型轮序号
 */
function resolveTurn(event: ParsedTraceEvent, currentTurn: number): number {
  const attrs = event.span.attributes ?? {}
  const explicitTurn = num(attrs.turn)
  if (explicitTurn != null) return explicitTurn
  if (event.type === 'trace.context') {
    const modelTurn = num((attrs.manifest as { modelTurn?: unknown } | undefined)?.modelTurn)
    if (modelTurn != null) return modelTurn
  }
  if (event.type === 'trace.visual') {
    const modelTurn = num((event.span as { modelTurn?: unknown }).modelTurn)
    if (modelTurn != null) return modelTurn
  }
  return event.type === 'trace.model' ? currentTurn + 1 : currentTurn
}

/**
 * 由耗时字段推导事件起点（纳秒）：模型用 attributes.durationMs，工具批次用单次调用的最大耗时。
 * @param event Trace 事件
 * @return 推导起点，无法推导时为 undefined
 */
function derivedStart(event: ParsedTraceEvent): number | undefined {
  const end = spanEnd(event)
  const attrs = event.span.attributes ?? {}
  if (end == null || event.type !== 'trace.model') {
    if (end == null || event.type !== 'trace.action') return undefined
    const durations = actionItems(event).map((item) => num(item.durationMs))
    const longest = Math.max(...durations.filter((d): d is number => d != null))
    return Number.isFinite(longest) ? end - longest * 1e6 : undefined
  }
  const durationMs = num(attrs.durationMs)
  return durationMs == null ? undefined : end - durationMs * 1e6
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
    const turn = resolveTurn(event, currentTurn)
    currentTurn = Math.max(currentTurn, turn)
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
        // 同一轮的并行工具调用打包在同一个事件里，按条数统计
        round.toolCalls += Math.max(actionItems(event).length, 1)
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

  // 瀑布条：优先 span 起止时间，缺失起点时由耗时字段推导，仍缺失则退化为零时长点（按 seq 展示）
  const ranges = sorted.map((event) => {
    const end = spanEnd(event)
    const start = spanStart(event) ?? derivedStart(event)
    return { event, start, end, actions: actionItems(event) }
  })
  const nanoTimes = ranges.map((r) => r.start ?? r.end).filter((t): t is number => t != null)
  const baseNano = nanoTimes.length ? Math.min(...nanoTimes) : 0
  let lastEndMs = 0
  const bars: TimelineBar[] = []
  const push = (bar: TimelineBar) => {
    bars.push(bar)
    lastEndMs = Math.max(lastEndMs, bar.offsetMs + bar.durationMs)
  }
  for (const { event, start, end, actions } of ranges) {
    const typeLabel = event.type.replace('trace.', '')
    if (end == null) {
      push({ event, offsetMs: lastEndMs, durationMs: 0, kind: 'event', label: typeLabel })
      continue
    }
    const endMs = (end - baseNano) / 1e6
    if (event.type === 'trace.action' && actions.length > 0 && start != null) {
      // 同一轮的工具调用并行执行：整批同时开始，各按自身耗时出条
      const batchStartMs = (start - baseNano) / 1e6
      actions.forEach((action, index) => {
        push({
          event,
          offsetMs: batchStartMs,
          durationMs: num(action.durationMs) ?? 0,
          kind: 'tool',
          label: `${TOOL_LABEL_PREFIX}${typeof action.tool === 'string' && action.tool ? action.tool : index + 1}`,
          actionIndex: index,
        })
      })
      continue
    }
    if (event.type === 'trace.model' && start != null) {
      const durationMs = Math.max((end - start) / 1e6, 0)
      const offsetMs = (start - baseNano) / 1e6
      const firstOutputMs = num(event.span.attributes?.firstOutputMs)
      if (firstOutputMs != null && firstOutputMs >= 0 && firstOutputMs <= durationMs) {
        push({ event, offsetMs, durationMs: firstOutputMs, kind: 'model-first-output', label: MODEL_FIRST_OUTPUT_LABEL })
        push({
          event,
          offsetMs: offsetMs + firstOutputMs,
          durationMs: durationMs - firstOutputMs,
          kind: 'model-generation',
          label: MODEL_GENERATION_LABEL,
        })
      } else {
        push({ event, offsetMs, durationMs, kind: 'event', label: typeLabel })
      }
      continue
    }
    const durationMs = start != null ? Math.max((end - start) / 1e6, 0) : 0
    push({ event, offsetMs: endMs - durationMs, durationMs, kind: 'event', label: typeLabel })
  }

  return { rounds, bars, totalDurationMs: lastEndMs, eventCount: sorted.length }
}
