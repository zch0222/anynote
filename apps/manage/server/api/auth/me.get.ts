/**
 * GET /api/auth/me：会话恢复 + at 过期自动单飞刷新 + ADMIN_X 在位复核。
 * 发现角色降权或账号停用时主动销票并清 Cookie，返回 403/A0301。
 */
import { defineEventHandler, getCookie, setCookie, setResponseStatus, setHeader } from 'h3'
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
  envelope,
  failureOutcome,
  readAuthResult,
  sessionExpiredOutcome,
  upstreamUnavailableFailure,
  type BffOutcome,
} from '../../utils/http'
import { createRefreshFn, refreshWithLock, type RefreshFn } from '../../utils/refresh'
import { createRevokeFn, revokeTokens, type RevokeFn } from '../../utils/revoke'
import { adminProfileSchema, isAdminProfile } from './login.post'

export interface MeInput {
  accessToken?: string
  refreshToken?: string
  clients: BackendClients
  env: CookieEnv
  refreshFn: RefreshFn
  /** 注销实现，缺省经 clients 调认证服务 /auth/logout */
  revokeFn?: RevokeFn
}

type MeResult =
  | { ok: true; profile: unknown; rotated?: TokenPair }
  | {
    ok: false
    outcome: BffOutcome
    /** 需要撤销的令牌对（角色失权或账号停用） */
    revoke?: TokenPair
    /** 本次已旋转出的新令牌对，响应需带上新 Cookie */
    rotated?: TokenPair
  }

async function fetchProfile(clients: BackendClients, accessToken: string) {
  try {
    return readAuthResult(
      await clients.systemClient.GET('/user/mine', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      }),
    )
  } catch {
    return { error: upstreamUnavailableFailure() } as const
  }
}

/** 会话核验核心：at 缺失先刷新，401 再补一次刷新重放，角色失权要求销票 */
export async function resolveSession(input: MeInput): Promise<MeResult> {
  let accessToken = input.accessToken
  const refreshToken = input.refreshToken ?? ''
  if (!accessToken && !refreshToken) {
    return { ok: false, outcome: sessionExpiredOutcome() }
  }

  let rotated: TokenPair | undefined
  if (!accessToken) {
    const outcome = await refreshWithLock(refreshToken, input.refreshFn)
    if (!outcome.ok) {
      return {
        ok: false,
        outcome:
          outcome.failure.status === 401
            ? { ...sessionExpiredOutcome(), clearCookies: buildClearCookieSpecs(input.env) }
            : failureOutcome(outcome.failure),
      }
    }
    accessToken = outcome.token.accessToken
    rotated = outcome.token
  }

  let result = await fetchProfile(input.clients, accessToken)
  if (result.error?.status === 401 && refreshToken && !rotated) {
    const outcome = await refreshWithLock(refreshToken, input.refreshFn)
    if (!outcome.ok) {
      return {
        ok: false,
        outcome:
          outcome.failure.status === 401
            ? { ...sessionExpiredOutcome(), clearCookies: buildClearCookieSpecs(input.env) }
            : failureOutcome(outcome.failure),
      }
    }
    rotated = outcome.token
    accessToken = outcome.token.accessToken
    result = await fetchProfile(input.clients, accessToken)
  }
  if (rotated && result.error?.status === 401) {
    // 新令牌仍被拒绝：会话已失效，注销新令牌对并清 Cookie
    await revokeTokens(input.revokeFn ?? createRevokeFn(input.clients), rotated)
    return {
      ok: false,
      outcome: { ...sessionExpiredOutcome(), clearCookies: buildClearCookieSpecs(input.env) },
    }
  }
  if (result.error) return { ok: false, outcome: failureOutcome(result.error), rotated }

  const parsed = adminProfileSchema.safeParse(result.data)
  if (!parsed.success) {
    return { ok: false, outcome: failureOutcome(upstreamUnavailableFailure()), rotated }
  }

  const loose = result.data as { status?: unknown }
  const disabled = typeof loose.status === 'number' && loose.status !== 0
  if (!isAdminProfile(parsed.data) || disabled) {
    // 会话期动态撤权：主动销票、清 Cookie、拒绝访问
    return {
      ok: false,
      outcome: {
        status: 403,
        body: envelope('A0301', MESSAGES.adminOnly),
        clearCookies: buildClearCookieSpecs(input.env),
      },
      revoke: rotated ?? {
        accessToken: accessToken ?? '',
        refreshToken,
      },
    }
  }

  return { ok: true, profile: parsed.data, rotated }
}

export async function executeMe(input: MeInput): Promise<BffOutcome> {
  const session = await resolveSession(input)
  if (!session.ok) {
    await revokeTokens(input.revokeFn ?? createRevokeFn(input.clients), session.revoke)
    return attachTokenCookies(session.outcome, session.rotated, input.env)
  }
  return attachTokenCookies(
    { status: 200, body: envelope('00000', MESSAGES.success, session.profile) },
    session.rotated,
    input.env,
  )
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const appUrl = config.public.appUrl as string
  const clients = createBackendClients(config.internalApiUrl as string)
  const env: CookieEnv = {
    deploymentEnv: process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV,
    appUrl,
  }

  const outcome = await executeMe({
    accessToken: getCookie(event, ACCESS_COOKIE),
    refreshToken: getCookie(event, REFRESH_COOKIE),
    clients,
    env,
    refreshFn: createRefreshFn(clients),
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
