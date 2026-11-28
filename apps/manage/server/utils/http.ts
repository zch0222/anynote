/**
 * Nitro BFF 通用 HTTP 工具：信封结构、错误描述与 Origin 校验。
 * 全部函数保持框架无关，h3 装配层只负责把 BffOutcome 写到响应。
 */

export const MESSAGES = {
  success: '操作成功',
  originUntrusted: '请求来源不受信任',
  upstreamUnavailable: '认证服务暂时不可用',
  requestFailed: '请求失败，请稍后重试',
  badJson: '请求体必须是有效 JSON',
  badParams: '请求参数错误',
  adminOnly: '仅超级管理员可登录管理后台',
  adminApiOnly: '只有系统管理员可以访问管理接口',
  sessionExpired: '登录状态已失效，请重新登录',
} as const

/** 统一的业务失败描述，handler 层据此写 HTTP 响应 */
export interface BffFailure {
  code: string
  msg: string
  status: number
}

export interface CookieSpec {
  name: string
  value: string
  expires?: Date
  maxAge?: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'strict'
  path: string
}

/** handler 层统一回写结构：状态码 + 信封 body + 可选 Cookie 动作 */
export interface BffOutcome {
  status: number
  body: { code: string; msg: string; data: unknown }
  cookies?: CookieSpec[]
  clearCookies?: CookieSpec[]
}

export function envelope(code: string, msg: string, data: unknown = null) {
  return { code, msg, data }
}

export function failureOutcome(failure: BffFailure): BffOutcome {
  return { status: failure.status, body: envelope(failure.code, failure.msg) }
}

export function upstreamUnavailableFailure(): BffFailure {
  return { code: 'B0400', msg: MESSAGES.upstreamUnavailable, status: 502 }
}

export function sessionExpiredOutcome(): BffOutcome {
  return {
    status: 401,
    body: envelope('A0311', MESSAGES.sessionExpired),
  }
}

/** Origin 严格匹配：仅当请求 Origin 与配置的站点来源完全一致时放行 */
export function checkOriginValue(origin: string | null | undefined, appUrl: string): boolean {
  if (!origin) return false
  try {
    return origin === new URL(appUrl).origin
  } catch {
    return false
  }
}

interface EnvelopeLike {
  code?: unknown
  msg?: unknown
  data?: unknown
}

/**
 * 解析 openapi-fetch 上游结果为数据或业务失败。
 * 与 apps/web 的 readAuthResult 语义一致：业务错误只透传 code/msg，不透传 data。
 */
export function readAuthResult(result: {
  data?: unknown
  error?: unknown
  response: { status: number; ok: boolean }
}): { data: unknown; error?: never } | { data?: never; error: BffFailure } {
  const raw = (result.data ?? result.error) as EnvelopeLike | undefined
  if (!raw || typeof raw.code !== 'string' || raw.code.length === 0 || result.response.status >= 500) {
    return { error: upstreamUnavailableFailure() }
  }
  if (raw.code !== '00000') {
    const msg = typeof raw.msg === 'string' && raw.msg ? raw.msg : MESSAGES.requestFailed
    return { error: { code: raw.code, msg, status: result.response.status } }
  }
  if (!result.response.ok) return { error: upstreamUnavailableFailure() }
  return { data: raw.data }
}
