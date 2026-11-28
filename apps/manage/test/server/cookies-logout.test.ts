/**
 * Cookie 纯函数与 logout 流程单测。
 */
import { describe, expect, it } from 'vitest'
import { executeLogout } from '~~/server/api/auth/logout.post'
import {
  buildClearCookieSpecs,
  buildTokenCookieSpecs,
  isSecureCookie,
  tokenExpiry,
} from '~~/server/utils/cookies'
import { checkOriginValue, readAuthResult } from '~~/server/utils/http'
import { TEST_ENV, futureTokenPair, makeJwt, okEnvelope, stubClients } from '../helpers'

describe('cookies 纯函数', () => {
  it('tokenExpiry 解析 exp 为 Date', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const expires = tokenExpiry(makeJwt(exp))
    expect(expires.getTime()).toBe(exp * 1000)
  })

  it('过期或缺失 exp 的 token 抛出异常', () => {
    expect(() => tokenExpiry(makeJwt(Math.floor(Date.now() / 1000) - 10))).toThrow()
    expect(() => tokenExpiry(makeJwt(Number.NaN))).toThrow()
  })

  it('开发环境 http 站点允许非 Secure，生产强制 Secure', () => {
    expect(isSecureCookie({ deploymentEnv: 'development', appUrl: 'http://localhost:3001' })).toBe(false)
    expect(isSecureCookie({ deploymentEnv: 'development', appUrl: 'https://manage.example.com' })).toBe(true)
    expect(isSecureCookie({ deploymentEnv: 'production', appUrl: 'http://localhost:3001' })).toBe(true)
  })

  it('写 Cookie 规格含 httpOnly/strict/path 与独立过期时间', () => {
    const specs = buildTokenCookieSpecs(futureTokenPair(), TEST_ENV)
    expect(specs).toHaveLength(2)
    expect(specs[0].name).toBe('manage_at')
    expect(specs[1].name).toBe('manage_rt')
    expect(specs[1].expires!.getTime()).toBeGreaterThan(specs[0].expires!.getTime())
    for (const spec of specs) {
      expect(spec.httpOnly).toBe(true)
      expect(spec.sameSite).toBe('strict')
      expect(spec.path).toBe('/')
    }
  })

  it('清除规格 maxAge=0 且过期时间为 epoch', () => {
    const specs = buildClearCookieSpecs(TEST_ENV)
    expect(specs).toHaveLength(2)
    for (const spec of specs) {
      expect(spec.maxAge).toBe(0)
      expect(spec.expires!.getTime()).toBe(0)
    }
  })
})

describe('http 工具', () => {
  it('checkOriginValue 严格匹配 origin', () => {
    expect(checkOriginValue('http://localhost:3001', 'http://localhost:3001')).toBe(true)
    expect(checkOriginValue('http://localhost:3001/', 'http://localhost:3001')).toBe(false)
    expect(checkOriginValue(null, 'http://localhost:3001')).toBe(false)
    expect(checkOriginValue('http://localhost:3001', 'not a url')).toBe(false)
  })

  it('readAuthResult 业务错误不透传 data', () => {
    const result = readAuthResult({
      error: { code: 'A0210', msg: '错误', data: { secret: 1 } },
      response: { status: 200, ok: true },
    })
    expect(result.error).toMatchObject({ code: 'A0210', msg: '错误' })
    expect(JSON.stringify(result.error)).not.toContain('secret')
  })

  it('readAuthResult 5xx 统一上游不可用', () => {
    const result = readAuthResult({
      error: { code: 'B0500', msg: 'x' },
      response: { status: 502, ok: false },
    })
    expect(result.error).toMatchObject({ code: 'B0400', status: 502 })
  })
})

describe('executeLogout', () => {
  const ORIGIN = 'http://localhost:3001'

  it('正常注销：调用上游并清 Cookie', async () => {
    const { clients, stubs } = stubClients()
    const token = futureTokenPair()
    stubs.authClient.POST.mockResolvedValueOnce(okEnvelope(null))
    const outcome = await executeLogout({
      origin: ORIGIN,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(200)
    expect(outcome.clearCookies).toHaveLength(2)
    expect(stubs.authClient.POST).toHaveBeenCalledWith(
      '/logout',
      expect.objectContaining({
        body: { accessToken: token.accessToken, refreshToken: token.refreshToken },
      }),
    )
  })

  it('无 Cookie 时不上游直接成功清 Cookie', async () => {
    const { clients, stubs } = stubClients()
    const outcome = await executeLogout({
      origin: ORIGIN,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(200)
    expect(stubs.authClient.POST).not.toHaveBeenCalled()
    expect(outcome.clearCookies).toHaveLength(2)
  })

  it('Origin 不匹配 403', async () => {
    const { clients } = stubClients()
    const outcome = await executeLogout({
      origin: 'http://evil.example.com',
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(403)
  })

  it('上游不可达仍清 Cookie 但返回 502', async () => {
    const { clients, stubs } = stubClients()
    const token = futureTokenPair()
    stubs.authClient.POST.mockRejectedValueOnce(new Error('down'))
    const outcome = await executeLogout({
      origin: ORIGIN,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(502)
    expect(outcome.clearCookies).toHaveLength(2)
  })
})
