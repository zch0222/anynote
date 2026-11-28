/**
 * 用户过程视图对比行：把详情接口的过程行整理为对比页的展示结构。
 * 对象文字、结果条目与完整全文都要带出，管理员才能逐项核对脱敏结果。纯函数，供检查器与单测复用。
 *
 * @author 称霸幼儿园
 */
import type { AgentProcessItem } from '~/lib/schemas/agent-trace'

/** 工具结果条目没有标题时用户端显示的占位文字 */
const UNREADABLE_TITLE = '未找到或无权访问的内容'

export interface ProcessCompareResultItem {
  title: string
  kbName: string | null
}

export interface ProcessCompareRow {
  /** 行键：行类型 + 行标识 */
  key: string
  /** 行标题：工具名或行类型 */
  title: string
  status: string
  /** 工具行的对象文字（用户端展示的 target.label），其余行为 null */
  target: string | null
  /** 工具行的结果计数，没有结果时为 null */
  resultCount: number | null
  /** 工具行的结果条目：标题与所属知识库 */
  resultItems: ProcessCompareResultItem[]
  /** 思考或过程说明的完整文字 */
  text: string
}

/**
 * 把过程视图行整理为对比行。
 * @param items 详情接口返回的过程行
 * @return 对比行，顺序与输入一致
 */
export function buildProcessCompareRows(items: AgentProcessItem[] | null | undefined): ProcessCompareRow[] {
  return (items ?? []).map((item) => ({
    key: `${item.type ?? ''}-${item.id ?? ''}`,
    title: item.name ?? item.type ?? '',
    status: item.status ?? '',
    target: item.target?.label || null,
    resultCount: item.result?.count ?? null,
    resultItems: (item.result?.items ?? []).map((entry) => ({
      title: entry.title || UNREADABLE_TITLE,
      kbName: entry.kbName || null,
    })),
    text: item.text ?? '',
  }))
}
