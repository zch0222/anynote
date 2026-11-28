/**
 * GET /api/auth/me 会话恢复单测：
 * at 缺失单飞刷新、角色降权/账号停用主动销票清 Cookie、刷新失败边界。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeMe } from '~~/server/api/auth/me.get'
import { resetRefreshInflight } from '~~/server/utils/refresh'
import {
  TEST_ENV,
  adminProfile,
  errEnvelope,
  futureTokenPair,
  okEnvelope,
  stubClients,
} from '../helpers'

describe('executeMe', () => {
  beforeEach(() => {
    resetRefreshInflight()
  })

  it('无任何 Cookie 返回 401 登录状态已失效', async () => {
    const { clients } = stubClients()
    const outcome = await executeMe({
      clients,
      env: TEST_ENV,
      refreshFn: vi.fn(),
    })
    expect(outcome.status).toBe(401)
    expect(outcome.body.msg).toBe('登录状态已失效，请重新登录')
  })

  it('at 有效且为 ADMIN_X 直接返回资料，无 Cookie 轮换', async () => {
    const { clients, stubs } = stubClients()
    const token = futureTokenPair()
    stubs.systemClient.GET.mockResolvedValueOnce(okEnvelope(adminProfile()))
    const outcome = await executeMe({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn: vi.fn(),
    })
    expect(outcome.status).toBe(200)
    expect(outcome.cookies).toBeUndefined()
    expect((outcome.body.data as { username?: string }).username).toBe('root')
  })

  it('at 缺失时先单飞刷新再拉资料并轮换 Cookie', async () => {
    const { clients, stubs } = stubClients()
    const oldToken = futureTokenPair()
    const newToken = futureTokenPair()
    const refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    stubs.systemClient.GET.mockResolvedValueOnce(okEnvelope(adminProfile()))

    const outcome = await executeMe({
      refreshToken: oldToken.refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn,
    })

    expect(outcome.status).toBe(200)
    expect(refreshFn).toHaveBeenCalledTimes(1)
    expect((outcome.cookies ?? []).map((c) => c.name)).toEqual(['manage_at', 'manage_rt'])
    // 用新 at 拉取资料
    const authHeader = stubs.systemClient.GET.mock.calls[0][1].headers.Authorization
    expect(authHeader).toBe(`Bearer ${newToken.accessToken}`)
  })

  it('角色被降级时主动销票、清 Cookie 并返回 403/A0301', async () => {
    const { clients, stubs } = stubClients()
    const token = futureTokenPair()
    stubs.systemClient.GET.mockResolvedValueOnce(okEnvelope(adminProfile('ROLE_USER')))
    stubs.authClient.POST.mockResolvedValueOnce(okEnvelope(null))

    const outcome = await executeMe({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn: vi.fn(),
    })

    expect(outcome.status).toBe(403)
    expect(outcome.body.code).toBe('A0301')
    expect((outcome.clearCookies ?? []).map((c) => c.name)).toEqual(['manage_at', 'manage_rt'])
    expect(stubs.authClient.POST).toHaveBeenCalledWith(
      '/logout',
      expect.objectContaining({
        body: { accessToken: token.accessToken, refreshToken: token.refreshToken },
      }),
    )
  })

  it('账号停用（status 非 0）同样触发撤权销票', async () => {
    const { clients, stubs } = stubClients()
    const token = futureTokenPair()
    stubs.systemClient.GET.mockResolvedValueOnce(
      okEnvelope({ ...adminProfile(), status: 1 }),
    )
    stubs.authClient.POST.mockResolvedValueOnce(okEnvelope(null))

    const outcome = await executeMe({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn: vi.fn(),
    })
    expect(outcome.status).toBe(403)
    expect(outcome.clearCookies?.length).toBe(2)
  })

  it('at 过期 401 时刷新重放一次', async () => {
    const { clients, stubs } = stubClients()
    const token = futureTokenPair()
    const newToken = futureTokenPair()
    const refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    stubs.systemClient.GET
      .mockResolvedValueOnce(errEnvelope('A0311', 'token expired', 401))
      .mockResolvedValueOnce(okEnvelope(adminProfile()))

    const outcome = await executeMe({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn,
    })

    expect(outcome.status).toBe(200)
    expect(stubs.systemClient.GET).toHaveBeenCalledTimes(2)
    expect(outcome.cookies?.length).toBe(2)
  })

  it('刷新失败 401 时清 Cookie 返回会话失效', async () => {
    const { clients } = stubClients()
    const token = futureTokenPair()
    const refreshFn = vi.fn().mockResolvedValue({
      ok: false,
      failure: { code: 'A0311', msg: '登录状态已失效，请重新登录', status: 401 },
    })
    const outcome = await executeMe({
      refreshToken: token.refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn,
    })
    expect(outcome.status).toBe(401)
    expect(outcome.clearCookies?.length).toBe(2)
  })

  it('at 缺失刷新后资料查询失败仍轮换 Cookie', async () => {
    const { clients, stubs } = stubClients()
    const newToken = futureTokenPair()
    const refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    stubs.systemClient.GET.mockRejectedValueOnce(new Error('down'))

    const outcome = await executeMe({
      refreshToken: futureTokenPair().refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn,
    })

    expect(outcome.status).toBe(502)
    expect((outcome.cookies ?? []).map((c) => c.value)).toEqual([newToken.accessToken, newToken.refreshToken])
  })

  it('at 过期刷新后资料查询返回业务错误仍轮换 Cookie', async () => {
    const { clients, stubs } = stubClients()
    const token = futureTokenPair()
    const newToken = futureTokenPair()
    const refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    stubs.systemClient.GET
      .mockResolvedValueOnce(errEnvelope('A0311', 'token expired', 401))
      .mockResolvedValueOnce(errEnvelope('B0001', '业务异常', 200))

    const outcome = await executeMe({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn,
    })

    expect(outcome.body.code).toBe('B0001')
    expect((outcome.cookies ?? []).map((c) => c.value)).toEqual([newToken.accessToken, newToken.refreshToken])
  })

  it('新令牌查询资料仍 401：注销新令牌并清 Cookie', async () => {
    const { clients, stubs } = stubClients()
    const newToken = futureTokenPair()
    const refreshFn = vi.fn().mockResolvedValue({ ok: true, token: newToken })
    stubs.systemClient.GET.mockResolvedValue(errEnvelope('A0311', 'token expired', 401))

    const outcome = await executeMe({
      refreshToken: futureTokenPair().refreshToken,
      clients,
      env: TEST_ENV,
      refreshFn,
    })

    expect(outcome.status).toBe(401)
    expect(outcome.cookies).toBeUndefined()
    expect((outcome.clearCookies ?? []).map((c) => c.name)).toEqual(['manage_at', 'manage_rt'])
    expect(stubs.authClient.POST).toHaveBeenCalledWith(
      '/logout',
      expect.objectContaining({
        body: { accessToken: newToken.accessToken, refreshToken: newToken.refreshToken },
      }),
    )
  })
})
