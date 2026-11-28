/**
 * M20.4 检索参数边界校验、交叉约束与默认值 diff 单测。
 */
import { describe, expect, it } from 'vitest'
import {
  defaultRetrievalValues,
  diffFromDefaults,
  resolveSettingsSync,
  toRetrievalUpdateBody,
  toRetrievalValues,
  validateRetrievalField,
  validateRetrievalValues,
} from '~/lib/schemas/retrieval-setting'

describe('defaultRetrievalValues', () => {
  it('24 项默认值与方案口径一致', () => {
    const v = defaultRetrievalValues()
    expect(v.rrfK).toBe(60)
    expect(v.channelCandidates).toBe(50)
    expect(v.keywordLexicalWeight).toBe(1.5)
    expect(v.questionSemanticWeight).toBe(1.2)
    expect(v.authorityGenerated).toBe(0.7)
    expect(v.searchDefaultLimit).toBe(10)
    expect(v.searchMaxLimit).toBe(20)
    expect(v.grepContextMax).toBe(5)
    expect(v.rerankEnabled).toBe(false)
    expect(Object.keys(v)).toHaveLength(24)
  })
})

describe('validateRetrievalField', () => {
  it('边界内外判定', () => {
    expect(validateRetrievalField('rrfK', 1)).toBeNull()
    expect(validateRetrievalField('rrfK', 1000)).toBeNull()
    expect(validateRetrievalField('rrfK', 0)).toBe('参数超出允许范围')
    expect(validateRetrievalField('rrfK', 1001)).toBe('参数超出允许范围')
    expect(validateRetrievalField('rrfK', 1.5)).toBe('参数超出允许范围')
    expect(validateRetrievalField('rrfK', Number.NaN)).toBe('参数超出允许范围')
  })

  it('权重允许两位小数', () => {
    expect(validateRetrievalField('keywordLexicalWeight', 1.5)).toBeNull()
    expect(validateRetrievalField('keywordLexicalWeight', 5.01)).toBe('参数超出允许范围')
  })
})

describe('validateRetrievalValues 交叉约束', () => {
  it('searchDefaultLimit 不得大于 searchMaxLimit', () => {
    const v = { ...defaultRetrievalValues(), searchDefaultLimit: 21 }
    expect(validateRetrievalValues(v)).toBe('默认返回条数不能大于最大返回条数')
  })

  it('grepContextDefault 不得大于 grepContextMax', () => {
    const v = { ...defaultRetrievalValues(), grepContextDefault: 5, grepContextMax: 4 }
    expect(validateRetrievalValues(v)).toBe('grep 默认上下文行数不能大于最大上下文行数')
  })

  it('默认值整体合法', () => {
    expect(validateRetrievalValues(defaultRetrievalValues())).toBeNull()
  })
})

describe('diffFromDefaults', () => {
  it('默认值无差异，修改后标记差异键', () => {
    expect(diffFromDefaults(defaultRetrievalValues()).size).toBe(0)
    const v = { ...defaultRetrievalValues(), rrfK: 80, rerankEnabled: true }
    const diff = diffFromDefaults(v)
    expect(diff.has('rrfK')).toBe(true)
    expect(diff.has('rerankEnabled')).toBe(true)
    expect(diff.size).toBe(2)
  })
})

describe('toRetrievalValues / toRetrievalUpdateBody', () => {
  it('version=0 空配置回落默认值', () => {
    expect(toRetrievalValues(null).rrfK).toBe(60)
  })

  it('后端值覆盖默认，缺失键回落', () => {
    const v = toRetrievalValues({ rrfK: 88, rerankEnabled: true } as never)
    expect(v.rrfK).toBe(88)
    expect(v.rerankEnabled).toBe(true)
    expect(v.searchMaxLimit).toBe(20)
  })

  it('更新请求体含全部 24 键', () => {
    expect(Object.keys(toRetrievalUpdateBody(defaultRetrievalValues()))).toHaveLength(24)
  })
})

describe('resolveSettingsSync', () => {
  const clean = { dirty: false, version: 3 }
  const dirty = { dirty: true, version: 3 }

  it('没有未保存修改时套用服务器数据', () => {
    expect(resolveSettingsSync(clean, { version: 4 })).toEqual({ apply: true, remoteUpdated: false })
    expect(resolveSettingsSync(clean, { version: 3 })).toEqual({ apply: true, remoteUpdated: false })
  })

  it('有未保存修改且服务器版本变化时保留草稿并提示', () => {
    expect(resolveSettingsSync(dirty, { version: 4 })).toEqual({ apply: false, remoteUpdated: true })
  })

  it('有未保存修改但服务器版本未变时不提示', () => {
    expect(resolveSettingsSync(dirty, { version: 3 })).toEqual({ apply: false, remoteUpdated: false })
  })

  it('没有服务器数据时不套用', () => {
    expect(resolveSettingsSync(clean, null)).toEqual({ apply: false, remoteUpdated: false })
    expect(resolveSettingsSync(dirty, undefined)).toEqual({ apply: false, remoteUpdated: false })
  })

  it('首次读取（尚未加载版本）视为版本变化', () => {
    expect(resolveSettingsSync({ dirty: true, version: null }, { version: 1 })).toEqual({ apply: false, remoteUpdated: true })
    expect(resolveSettingsSync({ dirty: false, version: null }, { version: 0 })).toEqual({ apply: true, remoteUpdated: false })
  })
})
