/**
 * Nitro 服务端直连 Gateway 的 openapi-fetch typed 客户端工厂。
 * 入参显式传 internalApiUrl，保证单测可注入桩客户端。
 */
import type { paths as AuthPaths } from '@anynote/api-client/src/auth'
import type { paths as SystemPaths } from '@anynote/api-client/src/system'
import createClient from 'openapi-fetch'

export function createBackendClients(internalApiUrl: string) {
  const baseUrl = `${internalApiUrl.replace(/\/$/, '')}/api`
  const init = { cache: 'no-store', redirect: 'error' } as const
  return {
    authClient: createClient<AuthPaths>({ ...init, baseUrl: `${baseUrl}/auth` }),
    systemClient: createClient<SystemPaths>({ ...init, baseUrl: `${baseUrl}/system` }),
  }
}

export type BackendClients = ReturnType<typeof createBackendClients>
