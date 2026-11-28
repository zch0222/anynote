/**
 * 上下文 blob 还原：trace.context 的 manifest 条目以哈希引用原文，
 * 由同场运行各 trace.context 事件的 blobs 按哈希查表还原（同一哈希整场只写一次，索引需覆盖整场运行）；
 * 缺失时标记缺省原因。纯函数，供检查器与单测复用。
 */
import type { ParsedTraceEvent } from '~/lib/schemas/agent-trace'

export interface ContextEntry {
  scope?: string
  sourceId?: string
  sourceType?: string
  version?: string
  transform?: string
  contentHash?: string
  /** 清单登记的 Token 数 */
  tokenCount?: number
  trustLevel?: string
  permissionBasis?: string
  selectedReason?: string
}

export interface ResolvedContextEntry extends ContextEntry {
  /** 还原出的原文；未登记/缺失时为 null */
  content: string | null
  missing: boolean
  missingReason?: string
}

interface ContextManifest {
  runId?: string
  modelTurn?: number
  entries?: ContextEntry[]
}

/** 一条哈希对应的原文 */
interface ContextBlob {
  hash?: unknown
  content?: unknown
}

/** 读取一条 blob 的哈希与原文，形状不符时为 null */
function readBlob(blob: unknown): { hash: string, content: string } | null {
  if (!blob || typeof blob !== 'object') return null
  const { hash, content } = blob as ContextBlob
  return typeof hash === 'string' && hash && typeof content === 'string' ? { hash, content } : null
}

/** 从各 trace.context 事件的 attributes.blobs 构建哈希→原文映射，兼容历史的 trace.blob 事件 */
export function buildBlobIndex(events: ParsedTraceEvent[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const event of events) {
    const attrs = event.span.attributes ?? {}
    if (event.type === 'trace.context' && Array.isArray(attrs.blobs)) {
      for (const blob of attrs.blobs) {
        const entry = readBlob(blob)
        if (entry) index.set(entry.hash, entry.content)
      }
      continue
    }
    if (event.type !== 'trace.blob') continue
    const hash = typeof attrs.contentHash === 'string' ? attrs.contentHash : attrs.hash
    const blob = readBlob({ hash, content: attrs.content })
    if (blob) index.set(blob.hash, blob.content)
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
