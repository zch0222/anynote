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
  buildClearCookieSpecs,
  buildTokenCookieSpecs,
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
import { adminProfileSchema, isAdminProfile } from './login.post'

export interface MeInput {
  accessToken?: string
  refreshToken?: string
  clients: BackendClients
  env: CookieEnv
  refreshFn: RefreshFn
}

type MeResult =
  | { ok: true; profile: unknown; rotated?: TokenPair }
  | { ok: false; outcome: BffOutcome; revoke?: TokenPair }

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
    result = await fetchProfile(input.clients, outcome.token.accessToken)
    rotated = outcome.token
  }
  if (result.error) return { ok: false, outcome: failureOutcome(result.error) }

  const parsed = adminProfileSchema.safeParse(result.data)
  if (!parsed.success) {
    return { ok: false, outcome: failureOutcome(upstreamUnavailableFailure()) }
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
    if (session.revoke) {
      try {
        await input.clients.authClient.POST('/logout', {
          body: {
            ...(session.revoke.accessToken ? { accessToken: session.revoke.accessToken } : {}),
            ...(session.revoke.refreshToken ? { refreshToken: session.revoke.refreshToken } : {}),
          },
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        // 销票失败不掩盖失权拒绝结果
      }
    }
    return session.outcome
  }

  let cookies
  if (session.rotated) {
    try {
      cookies = buildTokenCookieSpecs(session.rotated, input.env)
    } catch {
      return failureOutcome(upstreamUnavailableFailure())
    }
  }
  return {
    status: 200,
    body: envelope('00000', MESSAGES.success, session.profile),
    ...(cookies ? { cookies } : {}),
  }
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
