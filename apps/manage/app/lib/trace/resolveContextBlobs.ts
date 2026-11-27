/**
 * 上下文 blob 还原：trace.context 的 manifest 条目若以哈希引用原文，
 * 由同场运行的 trace.blob 事件按哈希查表还原；缺失时标记缺省原因。
 * 纯函数，供检查器与单测复用。
 */
import type { ParsedTraceEvent } from '~/lib/schemas/agent-trace'

export interface ContextEntry {
  scope?: string
  version?: string
  sourceId?: string
  sourceType?: string
  transform?: string
  contentHash?: string
  charCount?: number
}

export interface ResolvedContextEntry extends ContextEntry {
  /** 还原出的原文；未登记/缺失时为 null */
  content: string | null
  missing: boolean
  missingReason?: string
}

interface ContextManifest {
  runId?: string
  entries?: ContextEntry[]
}

/** 从 trace.blob 事件构建哈希→原文映射 */
export function buildBlobIndex(events: ParsedTraceEvent[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const event of events) {
    if (event.type !== 'trace.blob') continue
    const attrs = event.span.attributes ?? {}
    const hash = typeof attrs.contentHash === 'string' ? attrs.contentHash
      : typeof attrs.hash === 'string' ? attrs.hash : null
    const content = typeof attrs.content === 'string' ? attrs.content : null
    if (hash && content != null) index.set(hash, content)
  }
  return index
}

/** 解析 trace.context 事件的 manifest 条目 */
export function parseContextManifest(event: ParsedTraceEvent | undefined): ContextEntry[] {
  if (!event) return []
  const attrs = event.span.attributes ?? {}
  const manifest = attrs.manifest as ContextManifest | undefined
  return Array.isArray(manifest?.entries) ? manifest.entries : []
}

/** 还原一轮上下文条目：命中 blob 表返回原文，否则按缺省口径标记 */
export function resolveContextEntries(
  entries: ContextEntry[],
  blobIndex: Map<string, string>,
): ResolvedContextEntry[] {
  return entries.map((entry) => {
    const hash = entry.contentHash
    if (!hash) {
      return { ...entry, content: null, missing: true, missingReason: '该层上下文原文缺失或哈希未登记' }
    }
    const content = blobIndex.get(hash)
    if (content == null) {
      return { ...entry, content: null, missing: true, missingReason: '该层上下文原文缺失或哈希未登记' }
    }
    return { ...entry, content, missing: false }
  })
}
