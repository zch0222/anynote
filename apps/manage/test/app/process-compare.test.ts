/**
 * 用户过程视图对比行单测。
 *
 * @author 称霸幼儿园
 */
import { describe, expect, it } from 'vitest'
import { buildProcessCompareRows } from '~/lib/trace/buildProcessCompare'
import type { AgentProcessItem } from '~/lib/schemas/agent-trace'

/** 模拟用户端实际渲染所需字段的过程行 */
const items: AgentProcessItem[] = [
  { id: 'r1', type: 'reasoning', status: 'done', text: '思'.repeat(500) },
  {
    id: 'c1',
    type: 'tool',
    name: 'kb_search',
    status: 'SUCCESS',
    durationMs: 420,
    target: { label: '期末复习 · 高数', resolved: true },
    result: {
      count: 12,
      items: [
        { ref: 'note:12', title: '高数期末复习提纲', kbName: '学习笔记', kbId: 3 },
        { ref: 'note:13', title: '线性代数要点', kbName: '学习笔记', kbId: 3 },
      ],
    },
  },
  { id: 'n1', type: 'note', text: '先检索再总结' },
  { id: 'x1', type: 'retry' },
  {
    id: 'c2',
    type: 'tool',
    name: 'kb_read',
    status: 'FAILED',
    target: { label: '未找到或无权访问的内容', resolved: false },
  },
]

describe('buildProcessCompareRows', () => {
  const rows = buildProcessCompareRows(items)

  it('思考与过程说明保留全文，不截断', () => {
    expect(rows[0]!.text.length).toBe(500)
    expect(rows[2]!.text).toBe('先检索再总结')
  })

  it('工具行带出用户实际看到的目标文字', () => {
    expect(rows[1]!.target).toBe('期末复习 · 高数')
    expect(rows[4]!.target).toBe('未找到或无权访问的内容')
    expect(rows[0]!.target).toBeNull()
  })

  it('工具行带出结果计数与结果条目的标题、知识库', () => {
    expect(rows[1]!.resultCount).toBe(12)
    expect(rows[1]!.resultItems).toEqual([
      { title: '高数期末复习提纲', kbName: '学习笔记' },
      { title: '线性代数要点', kbName: '学习笔记' },
    ])
  })

  it('失败工具行没有结果；重试行只有类型', () => {
    expect(rows[4]!.resultCount).toBeNull()
    expect(rows[4]!.resultItems).toEqual([])
    expect(rows[3]).toMatchObject({ title: 'retry', status: '', text: '' })
  })

  it('行标题与状态沿用过程行', () => {
    expect(rows[1]!.title).toBe('kb_search')
    expect(rows[1]!.status).toBe('SUCCESS')
    expect(rows[0]!.title).toBe('reasoning')
  })

  it('无过程视图时返回空数组', () => {
    expect(buildProcessCompareRows(null)).toEqual([])
    expect(buildProcessCompareRows(undefined)).toEqual([])
  })
})
