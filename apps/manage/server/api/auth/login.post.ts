/**
 * POST /api/auth/login：超管专属登录。
 * Origin 校验 → 账密登录 → /user/mine 核验 ADMIN_X → 非超管立即销票不发文凭。
 * executeLogin 为可注入依赖的纯流程核心，默认 handler 仅做 h3 装配。
 */
import { defineEventHandler, readBody, getHeader, setCookie, setResponseStatus, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { z } from 'zod'
import { createBackendClients, type BackendClients } from '../../utils/backend'
import { buildTokenCookieSpecs, type CookieEnv } from '../../utils/cookies'
import {
  MESSAGES,
  checkOriginValue,
  envelope,
  failureOutcome,
  readAuthResult,
  upstreamUnavailableFailure,
  type BffOutcome,
} from '../../utils/http'

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

/** 浏览器端会话资料白名单：token 与后端敏感字段一律不下发 */
export const adminProfileSchema = z.object({
  id: z.number().nullish(),
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  avatar: z.string().nullish(),
  role: z
    .object({
      id: z.number().optional(),
      roleKey: z.string().optional(),
      roleName: z.string().optional(),
    })
    .nullish(),
})
export type AdminProfile = z.infer<typeof adminProfileSchema>

export function isAdminProfile(profile: AdminProfile): boolean {
  return profile.role?.roleKey === 'ADMIN_X'
}

export interface LoginInput {
  origin: string | null
  body: unknown
  appUrl: string
  clients: BackendClients
  env: CookieEnv
}

const tokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
})

export async function executeLogin(input: LoginInput): Promise<BffOutcome> {
  if (!checkOriginValue(input.origin, input.appUrl)) {
    return { status: 403, body: envelope('A0301', MESSAGES.originUntrusted) }
  }

  const parsed = loginSchema.safeParse(input.body)
  if (!parsed.success) {
    return { status: 400, body: envelope('A0160', MESSAGES.badParams) }
  }

  let loginData: unknown
  try {
    const result = readAuthResult(
      await input.clients.authClient.POST('/login', {
        body: parsed.data,
        signal: AbortSignal.timeout(10_000),
      }),
    )
    if (result.error) return failureOutcome(result.error)
    loginData = result.data
  } catch {
    return failureOutcome(upstreamUnavailableFailure())
  }

  const session = z
    .object({
      token: tokenPairSchema,
    })
    .safeParse(loginData)
  if (!session.success) return failureOutcome(upstreamUnavailableFailure())
  const token = session.data.token

  // 用刚签发的 at 复核完整角色，非超管立即销毁会话
  let profileData: unknown
  try {
    const result = readAuthResult(
      await input.clients.systemClient.GET('/user/mine', {
        headers: { Authorization: `Bearer ${token.accessToken}` },
        signal: AbortSignal.timeout(10_000),
      }),
    )
    if (result.error) return failureOutcome(result.error)
    profileData = result.data
  } catch {
    return failureOutcome(upstreamUnavailableFailure())
  }

  const profile = adminProfileSchema.safeParse(profileData)
  if (!profile.success) return failureOutcome(upstreamUnavailableFailure())

  if (!isAdminProfile(profile.data)) {
    // 立即销票：非超管签发的令牌对在 Redis 零残留，不发 Cookie
    try {
      await input.clients.authClient.POST('/logout', {
        body: { accessToken: token.accessToken, refreshToken: token.refreshToken },
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      // 销票失败不掩盖准入拒绝结果
    }
    return { status: 403, body: envelope('A0301', MESSAGES.adminOnly) }
  }

  let cookies
  try {
    cookies = buildTokenCookieSpecs(token, input.env)
  } catch {
    return failureOutcome(upstreamUnavailableFailure())
  }
  const { ...safeProfile } = profile.data
  return {
    status: 200,
    body: envelope('00000', MESSAGES.success, safeProfile),
    cookies,
  }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const appUrl = config.public.appUrl as string
  const clients = createBackendClients(config.internalApiUrl as string)

  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    body = undefined
  }

  const outcome = await executeLogin({
    origin: getHeader(event, 'origin') ?? null,
    body,
    appUrl,
    clients,
    env: { deploymentEnv: process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV, appUrl },
  })

  setResponseStatus(event, outcome.status)
  setHeader(event, 'Cache-Control', 'no-store')
  for (const spec of outcome.cookies ?? []) {
    setCookie(event, spec.name, spec.value, spec)
  }
  return outcome.body
})
