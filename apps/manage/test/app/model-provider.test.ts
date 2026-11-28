/**
 * M20.3 模型供应商与逻辑模型校验纯函数单测（用户拍板文案逐字断言）。
 */
import { describe, expect, it } from 'vitest'
import {
  buildDeleteProviderMessage,
  emptyProviderForm,
  findLogicalReferencers,
  isValidProviderBaseUrl,
  parseEmbeddingDimensions,
  parseProcessReasoningMaxChars,
  parseProviderModels,
  toProviderForm,
  validateLogicalForm,
  validateProviderForm,
  type ModelProvider,
} from '~/lib/schemas/model-provider'

function provider(overrides: Partial<ModelProvider> = {}): ModelProvider {
  return {
    providerKey: 'volc',
    displayName: '火山引擎',
    protocol: 'openai_compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-pro'],
    dataEgressAllowed: true,
    enabled: true,
    processReasoningMaxChars: 8000,
    ...overrides,
  }
}

describe('validateProviderForm', () => {
  it('合法新增表单通过', () => {
    const form = { ...emptyProviderForm(), providerKey: 'volc', displayName: '火山', baseUrl: 'https://a.com', apiKey: 'sk-x', models: 'm1' }
    expect(validateProviderForm(form, true)).toBeNull()
  })

  it('缺供应商标识', () => {
    const form = { ...emptyProviderForm(), displayName: 'x', baseUrl: 'https://a.com', apiKey: 'k', models: 'm' }
    expect(validateProviderForm(form, true)).toBe('请输入供应商标识')
  })

  it('缺展示名', () => {
    const form = { ...emptyProviderForm(), providerKey: 'v', baseUrl: 'https://a.com', apiKey: 'k', models: 'm' }
    expect(validateProviderForm(form, true)).toBe('请输入供应商展示名称')
  })

  it('非法 Base URL', () => {
    const form = { ...emptyProviderForm(), providerKey: 'v', displayName: 'x', baseUrl: 'ftp://a', apiKey: 'k', models: 'm' }
    expect(validateProviderForm(form, true)).toBe('请输入合法的 Base URL')
  })

  it('新增缺 API Key、编辑留空放行', () => {
    const form = { ...emptyProviderForm(), providerKey: 'v', displayName: 'x', baseUrl: 'https://a.com', models: 'm' }
    expect(validateProviderForm(form, true)).toBe('新增供应商时必须输入 API Key')
    expect(validateProviderForm(form, false)).toBeNull()
  })

  it('模型列表为空', () => {
    const form = { ...emptyProviderForm(), providerKey: 'v', displayName: 'x', baseUrl: 'https://a.com', apiKey: 'k', models: ' , ' }
    expect(validateProviderForm(form, true)).toBe('至少填写一个模型标识')
  })

  it('思考截断越界', () => {
    const base = { ...emptyProviderForm(), providerKey: 'v', displayName: 'x', baseUrl: 'https://a.com', apiKey: 'k', models: 'm' }
    expect(validateProviderForm({ ...base, processReasoningMaxChars: '499' }, true)).toBe('思考截断字数需在 500 到 200000 之间')
    expect(validateProviderForm({ ...base, processReasoningMaxChars: '200001' }, true)).toBe('思考截断字数需在 500 到 200000 之间')
    expect(validateProviderForm({ ...base, processReasoningMaxChars: 'abc' }, true)).toBe('思考截断字数需在 500 到 200000 之间')
  })
})

describe('解析纯函数', () => {
  it('parseProcessReasoningMaxChars 边界', () => {
    expect(parseProcessReasoningMaxChars('500')).toBe(500)
    expect(parseProcessReasoningMaxChars('200000')).toBe(200000)
    expect(parseProcessReasoningMaxChars(' 8000 ')).toBe(8000)
    expect(parseProcessReasoningMaxChars('0')).toBeNull()
    expect(parseProcessReasoningMaxChars('1.5')).toBeNull()
  })

  it('isValidProviderBaseUrl 仅放行 http/https', () => {
    expect(isValidProviderBaseUrl('https://a.com/v1')).toBe(true)
    expect(isValidProviderBaseUrl('http://localhost:8080')).toBe(true)
    expect(isValidProviderBaseUrl('ftp://a.com')).toBe(false)
    expect(isValidProviderBaseUrl('not a url')).toBe(false)
  })

  it('parseProviderModels 去重去空', () => {
    expect(parseProviderModels('a, b ,a,, c')).toEqual(['a', 'b', 'c'])
  })

  it('parseEmbeddingDimensions 留空合法自动探测', () => {
    expect(parseEmbeddingDimensions('')).toEqual({ ok: true, value: undefined })
    expect(parseEmbeddingDimensions('1024')).toEqual({ ok: true, value: 1024 })
    expect(parseEmbeddingDimensions('0').ok).toBe(false)
    expect(parseEmbeddingDimensions('2049').ok).toBe(false)
    expect(parseEmbeddingDimensions('x').ok).toBe(false)
  })

  it('toProviderForm 不回显 apiKey', () => {
    expect(toProviderForm(provider()).apiKey).toBe('')
  })
})

describe('validateLogicalForm', () => {
  const base = {
    enabled: true,
    providerKey: 'volc',
    model: 'doubao-pro',
    dimensions: '',
    reasoningFormat: 'none' as const,
    reasoningPassthrough: 'none' as const,
    supportsVision: false,
  }

  it('出境供应商启用被阻断', () => {
    const msg = validateLogicalForm(base, 'agent_main', [provider({ dataEgressAllowed: false })])
    expect(msg).toBe('当前供应商禁止数据出境，不能启用该逻辑模型')
  })

  it('允许出境供应商通过', () => {
    expect(validateLogicalForm(base, 'agent_main', [provider()])).toBeNull()
  })

  it('停用状态下跳过供应商校验', () => {
    expect(validateLogicalForm({ ...base, enabled: false }, 'agent_main', [])).toBeNull()
  })

  it('embedding 维度越界优先报维度文案', () => {
    expect(validateLogicalForm({ ...base, dimensions: '9999' }, 'embedding', [])).toBe('向量维度需在 1 到 2048 之间')
  })
})

describe('删除预检', () => {
  it('findLogicalReferencers 找出绑定卡片', () => {
    const refs = findLogicalReferencers('volc', [
      { logicalName: 'agent_main', providerKey: 'volc' },
      { logicalName: 'fast', providerKey: 'other' },
      null,
    ] as never)
    expect(refs).toEqual(['agent_main'])
  })

  it('无引用时为基础确认文案', () => {
    expect(buildDeleteProviderMessage('火山引擎', [])).toBe('确认删除供应商“火山引擎”？此操作不可恢复。')
  })

  it('有引用时附高亮警告', () => {
    const msg = buildDeleteProviderMessage('火山引擎', ['agent_main'])
    expect(msg).toContain('确认删除供应商“火山引擎”？此操作不可恢复。')
    expect(msg).toContain('当前供应商正被逻辑模型 [agent_main] 绑定，删除后新发起的对话将无法启动。')
  })
})
