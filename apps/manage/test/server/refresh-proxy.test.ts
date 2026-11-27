/**
 * refreshWithLock 单飞锁、proxy 白名单与代理重放单测。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeProxy } from '~~/server/api/proxy/[...path]'
import { hasPathTraversal, isAllowedProxyPath } from '~~/server/utils/proxy-allowlist'
import { refreshWithLock, resetRefreshInflight } from '~~/server/utils/refresh'
import { TEST_ENV, futureTokenPair } from '../helpers'

describe('refreshWithLock', () => {
  beforeEach(() => resetRefreshInflight())

  it('10 个并发刷新只触发 1 次上游调用', async () => {
    const token = futureTokenPair()
    let resolveBackend: (v: { ok: true; token: typeof token }) => void = () => {}
    const backend = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBackend = resolve as typeof resolveBackend
        }),
    )
    const calls = Array.from({ length: 10 }, () => refreshWithLock('rt-1', backend))
    expect(backend).toHaveBeenCalledTimes(1)
    resolveBackend({ ok: true, token })
    const results = await Promise.all(calls)
    for (const r of results) {
      expect(r).toEqual({ ok: true, token })
    }
  })

  it('失败后释放锁，后续调用可重试', async () => {
    const failure = { code: 'B0400', msg: '认证服务暂时不可用', status: 502 }
    const backend = vi.fn().mockResolvedValue({ ok: false, failure })
    const first = await refreshWithLock('rt-2', backend)
    expect(first.ok).toBe(false)
    await refreshWithLock('rt-2', backend)
    expect(backend).toHaveBeenCalledTimes(2)
  })

  it('不同 rt 互不共享单飞', async () => {
    const token = futureTokenPair()
    const backend = vi.fn().mockResolvedValue({ ok: true, token })
    await Promise.all([refreshWithLock('rt-a', backend), refreshWithLock('rt-b', backend)])
    expect(backend).toHaveBeenCalledTimes(2)
  })
})

describe('proxy 路径白名单', () => {
  it('放行 /ai/v1/admin 前缀', () => {
    expect(isAllowedProxyPath('/ai/v1/admin/agent-runs')).toBe(true)
    expect(isAllowedProxyPath('/ai/v1/admin')).toBe(true)
    expect(isAllowedProxyPath('/ai/v1/admin/model-providers/x')).toBe(true)
  })

  it('拦截非白名单路径', () => {
    expect(isAllowedProxyPath('/note/notes')).toBe(false)
    expect(isAllowedProxyPath('/ai/internal/v1/runs')).toBe(false)
    expect(isAllowedProxyPath('/ai/v1/chat')).toBe(false)
    expect(isAllowedProxyPath('/system/user/mine')).toBe(false)
    expect(isAllowedProxyPath('/ai/v1/adminx')).toBe(false)
    expect(isAllowedProxyPath('ai/v1/admin')).toBe(false)
  })

  it('路径穿越段检测含双重编码', () => {
    expect(hasPathTraversal('/ai/v1/admin/../chat')).toBe(true)
    expect(hasPathTraversal('/ai/v1/admin/%2e%2e/chat')).toBe(true)
    expect(hasPathTraversal('/ai/v1/admin/%252e%252e/chat')).toBe(true)
    expect(hasPathTraversal('/ai/v1/admin/%')).toBe(true)
    expect(hasPathTraversal('/ai/v1/admin/agent-runs')).toBe(false)
    expect(isAllowedProxyPath('/ai/v1/admin/../v1/chat')).toBe(false)
    expect(isAllowedProxyPath('/ai\\v1\\admin')).toBe(false)
  })
})

describe('executeProxy', () => {
  beforeEach(() => resetRefreshInflight())

  function baseInput(overrides: Record<string, unknown> = {}) {
    const token = futureTokenPair()
    return {
      method: 'GET',
      path: '/ai/v1/admin/agent-runs',
      queryString: '',
      body: undefined,
      origin: 'http://localhost:3001',
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      appUrl: TEST_ENV.appUrl,
      internalApiUrl: 'http://anynote-gateway:8080',
      env: TEST_ENV,
      refreshFn: vi.fn(),
      fetchImpl: vi.fn(),
      ...overrides,
    } as Parameters<typeof executeProxy>[0]
  }

  function jsonResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('非白名单路径直接 403 不转发', async () => {
    const input = baseInput({ path: '/note/notes' })
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(403)
    expect(outcome.body.msg).toBe('只有系统管理员可以访问管理接口')
    expect(input.fetchImpl).not.toHaveBeenCalled()
  })

  it('路径穿越直接 403', async () => {
    const input = baseInput({ path: '/ai/v1/admin/../chat' })
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(403)
    expect(input.fetchImpl).not.toHaveBeenCalled()
  })

  it('写请求 Origin 不匹配 403', async () => {
    const input = baseInput({ method: 'POST', origin: 'http://evil.example.com' })
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(403)
    expect(outcome.body.msg).toBe('请求来源不受信任')
  })

  it('GET 请求不强制 Origin', async () => {
    const input = baseInput({ origin: null })
    ;(input.fetchImpl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ code: '00000', msg: '操作成功', data: { list: [] } }),
    )
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(200)
  })

  it('正常转发带 Bearer 并原样透传信封', async () => {
    const input = baseInput({ queryString: 'pageNum=1' })
    const fetchMock = input.fetchImpl as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: '00000', msg: '操作成功', data: { total: 0 } }),
    )
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(200)
    expect(outcome.body.data).toEqual({ total: 0 })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://anynote-gateway:8080/api/ai/v1/admin/agent-runs?pageNum=1')
    expect(init.headers.Authorization).toMatch(/^Bearer /)
  })

  it('401 时单飞刷新重放并轮换 Cookie', async () => {
    const newToken = futureTokenPair()
    const refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    const input = baseInput({ refreshFn })
    const fetchMock = input.fetchImpl as ReturnType<typeof vi.fn>
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 'A0311', msg: 'x' }, 401))
      .mockResolvedValueOnce(jsonResponse({ code: '00000', msg: '操作成功', data: [] }))

    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((outcome.cookies ?? []).map((c) => c.name)).toEqual(['manage_at', 'manage_rt'])
    const secondAuth = fetchMock.mock.calls[1][1].headers.Authorization
    expect(secondAuth).toBe(`Bearer ${newToken.accessToken}`)
  })

  it('无会话 Cookie 返回 401 并下发清除规格', async () => {
    const input = baseInput({ accessToken: undefined, refreshToken: undefined })
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(401)
    expect(outcome.clearCookies?.length).toBe(2)
  })

  it('at 缺失时先刷新再转发', async () => {
    const newToken = futureTokenPair()
    const refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    const input = baseInput({ accessToken: undefined, refreshFn })
    ;(input.fetchImpl as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ code: '00000', msg: '操作成功', data: null }),
    )
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(200)
    expect(refreshFn).toHaveBeenCalledTimes(1)
  })

  it('上游不可达返回 502', async () => {
    const input = baseInput()
    ;(input.fetchImpl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'))
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(502)
    expect(outcome.body.msg).toBe('认证服务暂时不可用')
  })
})
