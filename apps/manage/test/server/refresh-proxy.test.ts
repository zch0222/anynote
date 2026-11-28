/**
 * refreshWithLock 单飞锁、proxy 白名单与代理重放单测。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeProxy } from '~~/server/api/proxy/[...path]'
import { hasPathTraversal, isAllowedProxyPath } from '~~/server/utils/proxy-allowlist'
import { ROTATED_REUSE_WINDOW_MS, refreshWithLock, resetRefreshInflight } from '~~/server/utils/refresh'
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

  it('成功旋转后复用窗口内的旧 rt 直接返回同一结果，不再调用后端', async () => {
    const token = futureTokenPair()
    const first = vi.fn().mockResolvedValue({ ok: true, token })
    const second = vi.fn()
    const now = 1_000_000
    expect(await refreshWithLock('rt-3', first, () => now)).toEqual({ ok: true, token })
    expect(await refreshWithLock('rt-3', second, () => now + 1000)).toEqual({ ok: true, token })
    expect(second).not.toHaveBeenCalled()
  })

  it('复用窗口过期后重新刷新，失败结果不缓存', async () => {
    const firstToken = futureTokenPair()
    const nextToken = futureTokenPair()
    const failure = { code: 'B0400', msg: '认证服务暂时不可用', status: 502 }
    let now = 1_000_000
    const backend = vi.fn()
      .mockResolvedValueOnce({ ok: true, token: firstToken })
      .mockResolvedValueOnce({ ok: false, failure })
      .mockResolvedValueOnce({ ok: true, token: nextToken })
    expect(await refreshWithLock('rt-4', backend, () => now)).toEqual({ ok: true, token: firstToken })
    now += ROTATED_REUSE_WINDOW_MS
    expect(await refreshWithLock('rt-4', backend, () => now)).toEqual({ ok: false, failure })
    expect(await refreshWithLock('rt-4', backend, () => now)).toEqual({ ok: true, token: nextToken })
    expect(backend).toHaveBeenCalledTimes(3)
  })
})

describe('proxy 路径白名单', () => {
  it('放行 /ai/v1/admin 与 /manage 前缀', () => {
    expect(isAllowedProxyPath('/ai/v1/admin/agent-runs')).toBe(true)
    expect(isAllowedProxyPath('/ai/v1/admin')).toBe(true)
    expect(isAllowedProxyPath('/ai/v1/admin/model-providers/x')).toBe(true)
    expect(isAllowedProxyPath('/manage/v1/admin/users')).toBe(true)
    expect(isAllowedProxyPath('/manage/v1/admin/users/1/ban')).toBe(true)
  })

  it('拦截非白名单路径', () => {
    expect(isAllowedProxyPath('/note/notes')).toBe(false)
    expect(isAllowedProxyPath('/ai/internal/v1/runs')).toBe(false)
    expect(isAllowedProxyPath('/ai/v1/chat')).toBe(false)
    expect(isAllowedProxyPath('/system/user/mine')).toBe(false)
    expect(isAllowedProxyPath('/ai/v1/adminx')).toBe(false)
    expect(isAllowedProxyPath('ai/v1/admin')).toBe(false)
    expect(isAllowedProxyPath('/managex')).toBe(false)
    expect(isAllowedProxyPath('/manage')).toBe(true)
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

  it('编码分隔符与 .. 同段、多重编码同样拦截', () => {
    for (const path of [
      '/ai/v1/admin/..%2f',
      '/ai/v1/admin/%2e%2e%2f',
      '/ai/v1/admin/..%5c..%5c',
      '/ai/v1/admin/%252e%252e%252f',
      '/ai/v1/admin/..%2f..%2fauth/refresh',
      '/ai/v1/admin/%25252e%25252e%25252fchat',
    ]) {
      expect(hasPathTraversal(path), path).toBe(true)
      expect(isAllowedProxyPath(path), path).toBe(false)
    }
  })

  it('普通业务路径中的点号与百分号编码文字不被误拦', () => {
    expect(isAllowedProxyPath('/ai/v1/admin/model-providers/volc.engine')).toBe(true)
    expect(isAllowedProxyPath('/ai/v1/admin/agent-runs/0b0e-4f2a')).toBe(true)
    expect(isAllowedProxyPath('/ai/v1/admin/model-providers/a%20b')).toBe(true)
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

  it('编码分隔符的穿越路径同样 403 不转发', async () => {
    const input = baseInput({ path: '/ai/v1/admin/..%2f..%2fauth/refresh' })
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

  function cookieValues(outcome: Awaited<ReturnType<typeof executeProxy>>) {
    return (outcome.cookies ?? []).map((c) => c.value)
  }

  function expiredThen(second: Response) {
    const input = baseInput()
    ;(input.fetchImpl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse({ code: 'A0311', msg: 'x' }, 401))
      .mockResolvedValueOnce(second)
    return input
  }

  it('错峰到达的旧 rt 请求复用已旋转结果，不清 Cookie', async () => {
    const newToken = futureTokenPair()
    // 后端已删除旧 rt：再次拿旧 rt 刷新只会 401
    const refreshFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, token: newToken })
      .mockResolvedValue({ ok: false, failure: { code: 'A0311', msg: '登录状态已失效，请重新登录', status: 401 } })
    const ok = () => jsonResponse({ code: '00000', msg: '操作成功', data: [] })

    const inputA = baseInput({ accessToken: 'expired-at', refreshToken: 'old-rt', refreshFn })
    ;(inputA.fetchImpl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse({ code: 'A0311', msg: 'x' }, 401))
      .mockResolvedValueOnce(ok())
    const outcomeA = await executeProxy(inputA)
    expect(cookieValues(outcomeA)).toEqual([newToken.accessToken, newToken.refreshToken])

    const inputB = baseInput({ accessToken: 'expired-at', refreshToken: 'old-rt', refreshFn })
    ;(inputB.fetchImpl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse({ code: 'A0311', msg: 'x' }, 401))
      .mockResolvedValueOnce(ok())
    const outcomeB = await executeProxy(inputB)
    expect(outcomeB.clearCookies).toBeUndefined()
    expect(outcomeB.status).toBe(200)
    expect(cookieValues(outcomeB)).toEqual([newToken.accessToken, newToken.refreshToken])
    expect(refreshFn).toHaveBeenCalledTimes(1)
  })

  it('刷新成功后重放返回 5xx 仍下发新 Cookie', async () => {
    const newToken = futureTokenPair()
    const input = expiredThen(jsonResponse({ code: 'B0500', msg: 'internal' }, 500))
    input.refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(500)
    expect(cookieValues(outcome)).toEqual([newToken.accessToken, newToken.refreshToken])
  })

  it('刷新成功后重放抛异常仍下发新 Cookie', async () => {
    const newToken = futureTokenPair()
    const input = baseInput({ refreshFn: vi.fn().mockResolvedValue({ ok: true, token: newToken }) })
    ;(input.fetchImpl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonResponse({ code: 'A0311', msg: 'x' }, 401))
      .mockRejectedValueOnce(new Error('down'))
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(502)
    expect(cookieValues(outcome)).toEqual([newToken.accessToken, newToken.refreshToken])
  })

  it('刷新成功后重放返回非 JSON 仍下发新 Cookie', async () => {
    const newToken = futureTokenPair()
    const input = expiredThen(new Response('<html>bad gateway</html>', { status: 502 }))
    input.refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(502)
    expect(cookieValues(outcome)).toEqual([newToken.accessToken, newToken.refreshToken])
  })

  it('at 缺失先刷新，转发失败仍下发新 Cookie', async () => {
    const newToken = futureTokenPair()
    const input = baseInput({ accessToken: undefined, refreshFn: vi.fn().mockResolvedValue({ ok: true, token: newToken }) })
    ;(input.fetchImpl as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('down'))
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(502)
    expect(cookieValues(outcome)).toEqual([newToken.accessToken, newToken.refreshToken])
  })

  it('新令牌重放仍 401：注销新令牌并清 Cookie', async () => {
    const newToken = futureTokenPair()
    const revokeFn = vi.fn().mockResolvedValue(undefined)
    const input = expiredThen(jsonResponse({ code: 'A0350', msg: 'x' }, 401))
    input.refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    input.revokeFn = revokeFn
    const outcome = await executeProxy(input)
    expect(outcome.status).toBe(401)
    expect(outcome.body.code).toBe('A0311')
    expect(outcome.cookies).toBeUndefined()
    expect((outcome.clearCookies ?? []).map((c) => c.name)).toEqual(['manage_at', 'manage_rt'])
    expect(revokeFn).toHaveBeenCalledWith(newToken)
  })
})
