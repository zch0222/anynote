/**
 * ALL /api/proxy/[...path]：统一网关代理。
 * 写请求 Origin 校验 + 路径段穿越拦截 + /ai/v1/admin/** 前缀白名单 +
 * Bearer 转换 + 401 单飞刷新重放并轮换 Cookie。
 */
import {
  defineEventHandler,
  getCookie,
  getHeader,
  getMethod,
  getRequestURL,
  getRouterParam,
  readBody,
  setCookie,
  setResponseStatus,
  setHeader,
} from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { createBackendClients, type BackendClients } from '../../utils/backend'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  attachTokenCookies,
  buildClearCookieSpecs,
  type CookieEnv,
  type TokenPair,
} from '../../utils/cookies'
import {
  MESSAGES,
  checkOriginValue,
  envelope,
  sessionExpiredOutcome,
  upstreamUnavailableFailure,
  failureOutcome,
  type BffOutcome,
} from '../../utils/http'
import { isAllowedProxyPath } from '../../utils/proxy-allowlist'
import { createRefreshFn, refreshWithLock, type RefreshFn } from '../../utils/refresh'
import { createRevokeFn, revokeTokens, type RevokeFn } from '../../utils/revoke'

export interface ProxyInput {
  method: string
  /** 以 / 开头的服务内路径，例如 /ai/v1/admin/agent-runs */
  path: string
  /** 原始 query string（不含 ?） */
  queryString: string
  body: unknown
  origin: string | null
  accessToken?: string
  refreshToken?: string
  appUrl: string
  internalApiUrl: string
  env: CookieEnv
  refreshFn: RefreshFn
  /** 新令牌重放仍被拒绝时用于注销新令牌对 */
  revokeFn?: RevokeFn
  fetchImpl?: typeof fetch
}

async function forward(
  fetchImpl: typeof fetch,
  internalApiUrl: string,
  input: ProxyInput,
  accessToken: string,
): Promise<Response> {
  const base = internalApiUrl.replace(/\/$/, '')
  const url = `${base}/api${input.path}${input.queryString ? `?${input.queryString}` : ''}`
  const method = input.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD' && input.body !== undefined
  return fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(hasBody ? { body: JSON.stringify(input.body) } : {}),
    signal: AbortSignal.timeout(30_000),
    redirect: 'error',
  })
}

async function readJsonResponse(response: Response): Promise<BffOutcome> {
  let data: unknown
  try {
    data = await response.json()
  } catch {
    return failureOutcome(upstreamUnavailableFailure())
  }
  if (
    data &&
    typeof data === 'object' &&
    typeof (data as { code?: unknown }).code === 'string' &&
    typeof (data as { msg?: unknown }).msg === 'string'
  ) {
    const env = data as { code: string; msg: string; data?: unknown }
    return { status: response.status, body: envelope(env.code, env.msg, env.data ?? null) }
  }
  return failureOutcome(upstreamUnavailableFailure())
}

/** 代理核心：白名单 → 会话 → 转发 → 401 单飞刷新重放 */
export async function executeProxy(input: ProxyInput): Promise<BffOutcome> {
  const method = input.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD' && !checkOriginValue(input.origin, input.appUrl)) {
    return { status: 403, body: envelope('A0301', MESSAGES.originUntrusted) }
  }

  if (!isAllowedProxyPath(input.path)) {
    return { status: 403, body: envelope('A0301', MESSAGES.adminApiOnly) }
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const refreshToken = input.refreshToken ?? ''
  let accessToken = input.accessToken

  if (!accessToken && !refreshToken) {
    return {
      ...sessionExpiredOutcome(),
      clearCookies: buildClearCookieSpecs(input.env),
    }
  }

  let rotated: TokenPair | undefined
  /** 刷新成功后，任何后续响应都带上新 Cookie：后端已旋转令牌，旧 refreshToken 不可恢复 */
  const withRotation = (outcome: BffOutcome) => attachTokenCookies(outcome, rotated, input.env)

  if (!accessToken) {
    const outcome = await refreshWithLock(refreshToken, input.refreshFn)
    if (!outcome.ok) {
      return outcome.failure.status === 401
        ? { ...sessionExpiredOutcome(), clearCookies: buildClearCookieSpecs(input.env) }
        : failureOutcome(outcome.failure)
    }
    accessToken = outcome.token.accessToken
    rotated = outcome.token
  }

  let response: Response
  try {
    response = await forward(fetchImpl, input.internalApiUrl, input, accessToken ?? '')
  } catch {
    return withRotation(failureOutcome(upstreamUnavailableFailure()))
  }

  if (response.status === 401 && refreshToken && !rotated) {
    const outcome = await refreshWithLock(refreshToken, input.refreshFn)
    if (!outcome.ok) {
      return outcome.failure.status === 401
        ? { ...sessionExpiredOutcome(), clearCookies: buildClearCookieSpecs(input.env) }
        : failureOutcome(outcome.failure)
    }
    rotated = outcome.token
    try {
      response = await forward(fetchImpl, input.internalApiUrl, input, outcome.token.accessToken)
    } catch {
      return withRotation(failureOutcome(upstreamUnavailableFailure()))
    }
  }

  if (rotated && response.status === 401) {
    // 新令牌仍被拒绝：会话已失效，注销新令牌对并清 Cookie
    await revokeTokens(input.revokeFn, rotated)
    return { ...sessionExpiredOutcome(), clearCookies: buildClearCookieSpecs(input.env) }
  }

  return withRotation(await readJsonResponse(response))
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const appUrl = config.public.appUrl as string
  const internalApiUrl = config.internalApiUrl as string
  const clients: BackendClients = createBackendClients(internalApiUrl)
  const env: CookieEnv = {
    deploymentEnv: process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV,
    appUrl,
  }

  const rawPath = getRouterParam(event, 'path') ?? ''
  const method = getMethod(event)
  let body: unknown
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = await readBody(event)
    } catch {
      body = undefined
    }
  }

  const outcome = await executeProxy({
    method,
    path: `/${rawPath}`,
    queryString: getRequestURL(event).search.replace(/^\?/, ''),
    body,
    origin: getHeader(event, 'origin') ?? null,
    accessToken: getCookie(event, ACCESS_COOKIE),
    refreshToken: getCookie(event, REFRESH_COOKIE),
    appUrl,
    internalApiUrl,
    env,
    refreshFn: createRefreshFn(clients),
    revokeFn: createRevokeFn(clients),
  })

  setResponseStatus(event, outcome.status)
  setHeader(event, 'Cache-Control', 'no-store')
  for (const spec of outcome.cookies ?? []) {
    setCookie(event, spec.name, spec.value, spec)
  }
  for (const spec of outcome.clearCookies ?? []) {
    setCookie(event, spec.name, spec.value, spec)
  }
  return outcome.body
})
