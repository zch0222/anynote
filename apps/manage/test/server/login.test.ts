/**
 * POST /api/auth/login 安全不变式单测：
 * 超管准入写 Cookie 且响应不含明文 token；非超管 403 无 Cookie 且立即销票；Origin 拦截。
 */
import { describe, expect, it } from 'vitest'
import { executeLogin } from '~~/server/api/auth/login.post'
import { ACCESS_COOKIE, REFRESH_COOKIE } from '~~/server/utils/cookies'
import {
  TEST_ENV,
  adminProfile,
  errEnvelope,
  futureTokenPair,
  okEnvelope,
  stubClients,
} from '../helpers'

const ORIGIN = 'http://localhost:3001'
const BODY = { username: 'root', password: 'secret' }

function setupLogin() {
  const { clients, stubs } = stubClients()
  const token = futureTokenPair()
  return { clients, stubs, token }
}

describe('executeLogin', () => {
  it('ADMIN_X 登录成功写 manage_at/manage_rt 且响应体不含明文 token', async () => {
    const { clients, stubs, token } = setupLogin()
    stubs.authClient.POST.mockResolvedValueOnce(okEnvelope({ token }))
    stubs.systemClient.GET.mockResolvedValueOnce(okEnvelope(adminProfile()))

    const outcome = await executeLogin({
      origin: ORIGIN,
      body: BODY,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })

    expect(outcome.status).toBe(200)
    expect(outcome.body.code).toBe('00000')
    const names = (outcome.cookies ?? []).map((c) => c.name)
    expect(names).toEqual([ACCESS_COOKIE, REFRESH_COOKIE])
    for (const cookie of outcome.cookies ?? []) {
      expect(cookie.httpOnly).toBe(true)
      expect(cookie.sameSite).toBe('strict')
      expect(cookie.path).toBe('/')
    }
    // 响应体白名单：无 token 任何字段
    expect(JSON.stringify(outcome.body)).not.toContain(token.accessToken)
    expect(JSON.stringify(outcome.body)).not.toContain('refreshToken')
    expect((outcome.body.data as { username?: string }).username).toBe('root')
  })

  it('普通角色登录返回 403/A0301、无 Set-Cookie、且调用后端 /logout 销票', async () => {
    const { clients, stubs, token } = setupLogin()
    stubs.authClient.POST.mockResolvedValueOnce(okEnvelope({ token }))
    stubs.systemClient.GET.mockResolvedValueOnce(okEnvelope(adminProfile('ROLE_USER')))
    stubs.authClient.POST.mockResolvedValueOnce(okEnvelope(null))

    const outcome = await executeLogin({
      origin: ORIGIN,
      body: BODY,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })

    expect(outcome.status).toBe(403)
    expect(outcome.body.code).toBe('A0301')
    expect(outcome.body.msg).toBe('仅超级管理员可登录管理后台')
    expect(outcome.cookies).toBeUndefined()
    // 销票调用：第二次 POST 是 /logout 且携带两个 token
    expect(stubs.authClient.POST).toHaveBeenCalledTimes(2)
    const [path, init] = stubs.authClient.POST.mock.calls[1]
    expect(path).toBe('/logout')
    expect(init.body).toEqual({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
    })
  })

  it('Origin 不匹配返回 403 且不触碰上游', async () => {
    const { clients, stubs } = setupLogin()
    const outcome = await executeLogin({
      origin: 'http://evil.example.com',
      body: BODY,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(403)
    expect(outcome.body.msg).toBe('请求来源不受信任')
    expect(stubs.authClient.POST).not.toHaveBeenCalled()
  })

  it('缺失 Origin 同样拦截', async () => {
    const { clients, stubs } = setupLogin()
    const outcome = await executeLogin({
      origin: null,
      body: BODY,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(403)
    expect(stubs.authClient.POST).not.toHaveBeenCalled()
  })

  it('参数缺失返回 400/A0160 请求参数错误', async () => {
    const { clients, stubs } = setupLogin()
    const outcome = await executeLogin({
      origin: ORIGIN,
      body: { username: '' },
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(400)
    expect(outcome.body).toMatchObject({ code: 'A0160', msg: '请求参数错误' })
    expect(stubs.authClient.POST).not.toHaveBeenCalled()
  })

  it('账密错误透传后端业务错误码与文案', async () => {
    const { clients, stubs } = setupLogin()
    stubs.authClient.POST.mockResolvedValueOnce(errEnvelope('A0210', '用户名或密码错误', 200))
    const outcome = await executeLogin({
      origin: ORIGIN,
      body: BODY,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.body).toMatchObject({ code: 'A0210', msg: '用户名或密码错误' })
    expect(outcome.cookies).toBeUndefined()
  })

  it('认证服务不可达返回 502 认证服务暂时不可用', async () => {
    const { clients, stubs } = setupLogin()
    stubs.authClient.POST.mockRejectedValueOnce(new Error('connect refused'))
    const outcome = await executeLogin({
      origin: ORIGIN,
      body: BODY,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(502)
    expect(outcome.body.msg).toBe('认证服务暂时不可用')
  })

  it('登录响应缺少 token 结构时按上游异常处理', async () => {
    const { clients, stubs } = setupLogin()
    stubs.authClient.POST.mockResolvedValueOnce(okEnvelope({}))
    const outcome = await executeLogin({
      origin: ORIGIN,
      body: BODY,
      appUrl: TEST_ENV.appUrl,
      clients,
      env: TEST_ENV,
    })
    expect(outcome.status).toBe(502)
    expect(outcome.cookies).toBeUndefined()
  })
})
