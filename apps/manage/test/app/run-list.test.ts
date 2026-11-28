/**
 * 运行结果筛选项与运行列表 URL 同步纯函数单测。
 *
 * @author 称霸幼儿园
 */
import { describe, expect, it } from 'vitest'
import {
  ALL_OUTCOMES_VALUE,
  RUN_OUTCOME_FILTERS,
  RUN_OUTCOME_SELECT_ITEMS,
  RUN_OUTCOMES,
  buildRunListQuery,
  fromOutcomeSelectValue,
  parseRunListQuery,
  runOutcomeColor,
  toOutcomeSelectValue,
} from '~/lib/schemas/agent-trace'

describe('RUN_OUTCOME_SELECT_ITEMS', () => {
  it('每个下拉项的 value 都是非空字符串（下拉组件不接受空字符串）', () => {
    expect(RUN_OUTCOME_SELECT_ITEMS.length).toBeGreaterThan(0)
    for (const item of RUN_OUTCOME_SELECT_ITEMS) expect(item.value.length, item.label).toBeGreaterThan(0)
  })

  it('与筛选项一一对应，“全部结果”用 ALL 表示', () => {
    expect(RUN_OUTCOME_SELECT_ITEMS.map((item) => item.label)).toEqual(RUN_OUTCOME_FILTERS.map((item) => item.label))
    expect(RUN_OUTCOME_SELECT_ITEMS[0]).toEqual({ label: '全部结果', value: ALL_OUTCOMES_VALUE })
    expect(RUN_OUTCOME_SELECT_ITEMS.slice(1).map((item) => item.value)).toEqual([...RUN_OUTCOMES])
  })

  it('筛选条件与下拉选中值互转', () => {
    expect(toOutcomeSelectValue('')).toBe(ALL_OUTCOMES_VALUE)
    expect(toOutcomeSelectValue('FAILED')).toBe('FAILED')
    expect(fromOutcomeSelectValue(ALL_OUTCOMES_VALUE)).toBe('')
    expect(fromOutcomeSelectValue('NOT_FOUND')).toBe('NOT_FOUND')
    for (const item of RUN_OUTCOME_SELECT_ITEMS) {
      expect(toOutcomeSelectValue(fromOutcomeSelectValue(item.value))).toBe(item.value)
    }
  })
})

describe('RUN_OUTCOME_FILTERS', () => {
  it('每个筛选项的值都是 Harness 的真实 RunOutcome，且覆盖全部结果', () => {
    const values = RUN_OUTCOME_FILTERS.map((option) => option.value).filter(Boolean)
    for (const value of values) expect(RUN_OUTCOMES).toContain(value)
    for (const outcome of RUN_OUTCOMES) expect(values).toContain(outcome)
    expect(RUN_OUTCOME_FILTERS[0]).toMatchObject({ label: '全部结果', value: '' })
  })

  it('每个筛选项的标签非空且互不相同', () => {
    const labels = RUN_OUTCOME_FILTERS.map((option) => option.label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const label of labels) expect(label.length).toBeGreaterThan(0)
  })
})

describe('runOutcomeColor', () => {
  it('正常回答为成功色，失败为错误色，已取消为中性色', () => {
    expect(runOutcomeColor('ANSWERED')).toBe('success')
    expect(runOutcomeColor('FAILED')).toBe('error')
    expect(runOutcomeColor('CANCELLED')).toBe('neutral')
  })

  it('其余结果与运行中状态用信息色', () => {
    expect(runOutcomeColor('NOT_FOUND')).toBe('info')
    expect(runOutcomeColor('RUNNING')).toBe('info')
    expect(runOutcomeColor(null)).toBe('info')
    expect(runOutcomeColor(undefined)).toBe('info')
  })
})

describe('parseRunListQuery', () => {
  it('还原筛选条件与页码', () => {
    expect(parseRunListQuery({ runId: '0b0e', userId: '7', outcome: 'FAILED', page: '3' })).toEqual({
      runId: '0b0e',
      userId: '7',
      outcome: 'FAILED',
      page: 3,
    })
  })

  it('缺少查询参数时回落默认值', () => {
    expect(parseRunListQuery({})).toEqual({ runId: '', userId: '', outcome: '', page: 1 })
    expect(parseRunListQuery(undefined)).toEqual({ runId: '', userId: '', outcome: '', page: 1 })
  })

  it('非字符串的筛选值与不在筛选项内的结果被丢弃', () => {
    expect(parseRunListQuery({ runId: ['a'], userId: 7, outcome: 'SUCCESS' })).toEqual({
      runId: '',
      userId: '',
      outcome: '',
      page: 1,
    })
  })

  it('非正整数页码回落到第 1 页', () => {
    for (const page of ['0', '-2', '2.5', 'abc', '']) {
      expect(parseRunListQuery({ page }).page, page).toBe(1)
    }
    expect(parseRunListQuery({ page: '12' }).page).toBe(12)
  })
})

describe('buildRunListQuery', () => {
  it('写入非空的筛选条件，第 1 页不写入页码', () => {
    expect(buildRunListQuery({ runId: '0b0e', userId: '', outcome: 'FAILED', page: 1 })).toEqual({
      runId: '0b0e',
      outcome: 'FAILED',
    })
  })

  it('第 2 页起把页码写入 URL', () => {
    expect(buildRunListQuery({ runId: '', userId: '7', outcome: '', page: 3 })).toEqual({ userId: '7', page: '3' })
  })

  it('没有条件时为空对象', () => {
    expect(buildRunListQuery({ runId: '', userId: '', outcome: '', page: 1 })).toEqual({})
  })

  it('与解析互为逆操作', () => {
    const state = { runId: '0b0e', userId: '7', outcome: 'NOT_FOUND', page: 4 }
    expect(parseRunListQuery(buildRunListQuery(state))).toEqual(state)
  })
})
