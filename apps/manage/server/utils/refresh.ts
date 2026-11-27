/**
 * 进程级单飞 Token 刷新锁：同一 rt 的并发刷新只打一次后端。
 * dev HMR 可能重新实例化模块，锁必须挂在 globalThis 上。
 */
import { z } from 'zod'
import type { BackendClients } from './backend'
import { readAuthResult, upstreamUnavailableFailure, type BffFailure } from './http'
import type { TokenPair } from './cookies'

export type RefreshOutcome =
  | { ok: true; token: TokenPair }
  | { ok: false; failure: BffFailure }

const tokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
})

export type RefreshFn = (refreshToken: string) => Promise<RefreshOutcome>

const globalStore = globalThis as typeof globalThis & {
  __anynoteManageRefreshInflight?: Map<string, Promise<RefreshOutcome>>
}
if (!globalStore.__anynoteManageRefreshInflight) {
  globalStore.__anynoteManageRefreshInflight = new Map()
}
const inflight = globalStore.__anynoteManageRefreshInflight

/** 生产默认刷新实现：POST /api/auth/refresh */
export function createRefreshFn(clients: BackendClients): RefreshFn {
  return async (refreshToken) => {
    try {
      const result = readAuthResult(
        await clients.authClient.POST('/refresh', {
          body: { refreshToken },
          signal: AbortSignal.timeout(10_000),
        }),
      )
      if (result.error) return { ok: false, failure: result.error }
      const token = tokenSchema.parse(result.data)
      return { ok: true, token }
    } catch {
      return { ok: false, failure: upstreamUnavailableFailure() }
    }
  }
}

/** 单飞刷新：并发调用共享同一 Promise，无论成败立即释放（成功即旋转，旧 rt 不再复用） */
export function refreshWithLock(refreshToken: string, refreshFn: RefreshFn): Promise<RefreshOutcome> {
  const existing = inflight.get(refreshToken)
  if (existing) return existing

  const pending = refreshFn(refreshToken).finally(() => {
    inflight.delete(refreshToken)
  })
  inflight.set(refreshToken, pending)
  return pending
}

/** 测试辅助：清空单飞锁表 */
export function resetRefreshInflight() {
  inflight.clear()
}
