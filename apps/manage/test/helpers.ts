/** 测试辅助：构造伪 JWT 与桩后端客户端 */
import { vi } from 'vitest'
import type { BackendClients } from '~~/server/utils/backend'

/** jose.decodeJwt 只解码不验签，因此手工拼接的伪 JWT 即可用于 Cookie 生命周期测试 */
export function makeJwt(expSeconds: number, extra: Record<string, unknown> = {}): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ exp: expSeconds, ...extra })}.sig`
}

export function futureTokenPair(offsetSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000)
  return {
    accessToken: makeJwt(now + offsetSeconds),
    refreshToken: makeJwt(now + offsetSeconds * 2),
  }
}

export function okEnvelope(data: unknown, status = 200) {
  return {
    data: { code: '00000', msg: '操作成功', data },
    response: { status, ok: status < 400 } as Response,
  }
}

export function errEnvelope(code: string, msg: string, status: number) {
  return {
    error: { code, msg },
    response: { status, ok: false } as Response,
  }
}

export interface StubClients {
  authClient: { POST: ReturnType<typeof vi.fn> }
  systemClient: { GET: ReturnType<typeof vi.fn> }
}

export function stubClients(): { clients: BackendClients; stubs: StubClients } {
  const stubs: StubClients = {
    authClient: { POST: vi.fn() },
    systemClient: { GET: vi.fn() },
  }
  return { clients: stubs as unknown as BackendClients, stubs }
}

export const TEST_ENV = { deploymentEnv: 'development', appUrl: 'http://localhost:3001' }

export function adminProfile(roleKey = 'ADMIN_X') {
  return {
    id: 1,
    username: 'root',
    nickname: '超管',
    avatar: null,
    role: { id: 1, roleKey, roleName: '超级管理员' },
  }
}
