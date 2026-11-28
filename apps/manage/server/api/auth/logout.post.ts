/**
 * POST /api/auth/logout：撤销当前会话令牌并清除 manage_at/manage_rt。
 * 无论上游结果如何都清 Cookie；上游不可达时按 502 告知但仍完成本地注销。
 */
import { defineEventHandler, getCookie, getHeader, setCookie, setResponseStatus, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { createBackendClients, type BackendClients } from '../../utils/backend'
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  buildClearCookieSpecs,
  type CookieEnv,
} from '../../utils/cookies'
import {
  MESSAGES,
  checkOriginValue,
  envelope,
  type BffOutcome,
} from '../../utils/http'

export interface LogoutInput {
  origin: string | null
  accessToken?: string
  refreshToken?: string
  appUrl: string
  clients: BackendClients
  env: CookieEnv
}

export async function executeLogout(input: LogoutInput): Promise<BffOutcome> {
  if (!checkOriginValue(input.origin, input.appUrl)) {
    return { status: 403, body: envelope('A0301', MESSAGES.originUntrusted) }
  }

  const clearCookies = buildClearCookieSpecs(input.env)
  const accessToken = input.accessToken ?? ''
  const refreshToken = input.refreshToken ?? ''

  if (!accessToken && !refreshToken) {
    return { status: 200, body: envelope('00000', MESSAGES.success), clearCookies }
  }

  try {
    const result = await input.clients.authClient.POST('/logout', {
      body: {
        ...(accessToken ? { accessToken } : {}),
        ...(refreshToken ? { refreshToken } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    })
    const status = result.response?.status ?? 200
    if (status >= 500) {
      return {
        status: 502,
        body: envelope('B0400', MESSAGES.upstreamUnavailable),
        clearCookies,
      }
    }
  } catch {
    return {
      status: 502,
      body: envelope('B0400', MESSAGES.upstreamUnavailable),
      clearCookies,
    }
  }
  return { status: 200, body: envelope('00000', MESSAGES.success), clearCookies }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const appUrl = config.public.appUrl as string
  const clients = createBackendClients(config.internalApiUrl as string)
  const env: CookieEnv = {
    deploymentEnv: process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV,
    appUrl,
  }

  const outcome = await executeLogout({
    origin: getHeader(event, 'origin') ?? null,
    accessToken: getCookie(event, ACCESS_COOKIE),
    refreshToken: getCookie(event, REFRESH_COOKIE),
    appUrl,
    clients,
    env,
  })

  setResponseStatus(event, outcome.status)
  setHeader(event, 'Cache-Control', 'no-store')
  for (const spec of outcome.clearCookies ?? []) {
    setCookie(event, spec.name, spec.value, spec)
  }
  return outcome.body
})
