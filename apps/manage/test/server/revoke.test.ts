/**
 * 令牌注销工具与刷新后附带 Cookie 的单测。
 *
 * @author 称霸幼儿园
 */
import { describe, expect, it, vi } from 'vitest'
import { attachTokenCookies, buildClearCookieSpecs } from '~~/server/utils/cookies'
import { failureOutcome, sessionExpiredOutcome, upstreamUnavailableFailure } from '~~/server/utils/http'
import { createRevokeFn, revokeTokens } from '~~/server/utils/revoke'
import { TEST_ENV, futureTokenPair, makeJwt, stubClients } from '../helpers'

describe('revokeTokens', () => {
  it('调用注销实现并传入完整令牌对', async () => {
    const revokeFn = vi.fn().mockResolvedValue(undefined)
    const token = futureTokenPair()
    await revokeTokens(revokeFn, token)
    expect(revokeFn).toHaveBeenCalledTimes(1)
    expect(revokeFn).toHaveBeenCalledWith(token)
  })

  it('缺注销实现或缺令牌时不做任何事', async () => {
    const revokeFn = vi.fn()
    await revokeTokens(undefined, futureTokenPair())
    await revokeTokens(revokeFn, undefined)
    expect(revokeFn).not.toHaveBeenCalled()
  })

  it('注销实现抛错时静默', async () => {
    const revokeFn = vi.fn().mockRejectedValue(new Error('down'))
    await expect(revokeTokens(revokeFn, futureTokenPair())).resolves.toBeUndefined()
  })
})

describe('createRevokeFn', () => {
  it('经认证服务 /logout 撤销令牌对', async () => {
    const { clients, stubs } = stubClients()
    const token = futureTokenPair()
    await createRevokeFn(clients)(token)
    expect(stubs.authClient.POST).toHaveBeenCalledWith(
      '/logout',
      expect.objectContaining({ body: { accessToken: token.accessToken, refreshToken: token.refreshToken } }),
    )
  })

  it('认证服务不可达时静默', async () => {
    const { clients, stubs } = stubClients()
    stubs.authClient.POST.mockRejectedValueOnce(new Error('down'))
    await expect(createRevokeFn(clients)(futureTokenPair())).resolves.toBeUndefined()
  })
})

describe('attachTokenCookies', () => {
  it('未刷新时原样返回响应', () => {
    const outcome = failureOutcome(upstreamUnavailableFailure())
    expect(attachTokenCookies(outcome, undefined, TEST_ENV)).toBe(outcome)
  })

  it('刷新后任何响应都带上新令牌对的 Cookie', () => {
    const token = futureTokenPair()
    const failed = attachTokenCookies(failureOutcome(upstreamUnavailableFailure()), token, TEST_ENV)
    expect(failed.status).toBe(502)
    expect((failed.cookies ?? []).map((c) => c.value)).toEqual([token.accessToken, token.refreshToken])

    const success = attachTokenCookies(
      { status: 200, body: { code: '00000', msg: '操作成功', data: 1 } },
      token,
      TEST_ENV,
    )
    expect(success.body.data).toBe(1)
    expect((success.cookies ?? []).map((c) => c.value)).toEqual([token.accessToken, token.refreshToken])
  })

  it('新令牌过期时间非法时按上游不可用处理', () => {
    const now = Math.floor(Date.now() / 1000)
    const outcome = attachTokenCookies(sessionExpiredOutcome(), { accessToken: makeJwt(now - 10), refreshToken: makeJwt(now + 60) }, TEST_ENV)
    expect(outcome.status).toBe(502)
    expect(outcome.cookies).toBeUndefined()
  })

  it('不改动传入的清除 Cookie 规格对象', () => {
    const clearCookies = buildClearCookieSpecs(TEST_ENV)
    const outcome = attachTokenCookies({ ...sessionExpiredOutcome(), clearCookies }, undefined, TEST_ENV)
    expect(outcome.clearCookies).toBe(clearCookies)
  })
})
