/**
 * manage_at / manage_rt httpOnly Cookie 读写纯函数与常量。
 * Cookie 键名独立于用户端 at/rt，避免 localhost 多端口互相覆盖。
 */
import { decodeJwt } from 'jose'

export const ACCESS_COOKIE = 'manage_at'
export const REFRESH_COOKIE = 'manage_rt'

export interface CookieEnv {
  deploymentEnv?: string
  appUrl: string
}

/** 仅本地 HTTP 开发环境允许非 Secure；生产与 HTTPS 恒为 true，绝不依据请求头降级 */
export function isSecureCookie(env: CookieEnv): boolean {
  const development = (env.deploymentEnv ?? process.env.NODE_ENV) === 'development'
  try {
    return !(development && new URL(env.appUrl).protocol === 'http:')
  } catch {
    return true
  }
}

function baseOptions(env: CookieEnv) {
  return {
    httpOnly: true,
    secure: isSecureCookie(env),
    sameSite: 'strict' as const,
    path: '/',
  }
}

/** 仅解析认证服务签发的 JWT exp 用于 Cookie 生命周期，验签仍由后端负责 */
export function tokenExpiry(token: string): Date {
  const { exp } = decodeJwt(token)
  const expires = new Date(typeof exp === 'number' ? exp * 1000 : Number.NaN)
  if (!Number.isFinite(expires.getTime()) || expires.getTime() <= Date.now()) {
    throw new Error('认证服务返回的 Token 过期时间无效')
  }
  return expires
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/** 两个 Token 都通过校验后才生成写 Cookie 规格，避免部分成功覆盖现有会话 */
export function buildTokenCookieSpecs(token: TokenPair, env: CookieEnv) {
  const accessExpires = tokenExpiry(token.accessToken)
  const refreshExpires = tokenExpiry(token.refreshToken)
  const base = baseOptions(env)
  return [
    { name: ACCESS_COOKIE, value: token.accessToken, expires: accessExpires, ...base },
    { name: REFRESH_COOKIE, value: token.refreshToken, expires: refreshExpires, ...base },
  ]
}

export function buildClearCookieSpecs(env: CookieEnv) {
  const base = baseOptions(env)
  const epoch = new Date(0)
  return [ACCESS_COOKIE, REFRESH_COOKIE].map((name) => ({
    name,
    value: '',
    expires: epoch,
    maxAge: 0,
    ...base,
  }))
}
