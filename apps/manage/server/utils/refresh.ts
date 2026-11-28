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

/**
 * 刷新成功后旧 rt 复用旋转结果的窗口（毫秒）。
 * 取代理转发上游的超时时间：cookie 轮换前已发出的在途请求最迟在这个时间内到达刷新步骤。
 */
export const ROTATED_REUSE_WINDOW_MS = 30_000

interface RotatedRecord {
  token: TokenPair
  /** 复用窗口截止时间戳（毫秒） */
  expiresAt: number
}

const globalStore = globalThis as typeof globalThis & {
  __anynoteManageRefreshInflight?: Map<string, Promise<RefreshOutcome>>
  __anynoteManageRefreshRotated?: Map<string, RotatedRecord>
}
if (!globalStore.__anynoteManageRefreshInflight) {
  globalStore.__anynoteManageRefreshInflight = new Map()
}
if (!globalStore.__anynoteManageRefreshRotated) {
  globalStore.__anynoteManageRefreshRotated = new Map()
}
const inflight = globalStore.__anynoteManageRefreshInflight
const rotated = globalStore.__anynoteManageRefreshRotated

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

/** 清掉已过期的旋转记录 */
function pruneRotated(now: number) {
  for (const [key, record] of rotated) {
    if (record.expiresAt <= now) rotated.delete(key)
  }
}

/**
 * 单飞刷新：并发调用共享同一 Promise；刷新成功后旧 rt 在复用窗口内直接返回同一结果，
 * 不再拿已被后端删除的旧 rt 重试。失败结果不缓存，立即可重试。
 * @param refreshToken 旧的 refreshToken
 * @param refreshFn 刷新实现
 * @param now 当前时间戳（毫秒），缺省取系统时间
 * @return 刷新结果
 */
export function refreshWithLock(
  refreshToken: string,
  refreshFn: RefreshFn,
  now: () => number = Date.now,
): Promise<RefreshOutcome> {
  const existing = inflight.get(refreshToken)
  if (existing) return existing

  pruneRotated(now())
  const reused = rotated.get(refreshToken)
  if (reused) return Promise.resolve({ ok: true, token: reused.token })

  const pending = refreshFn(refreshToken)
    .then((outcome) => {
      if (outcome.ok) {
        rotated.set(refreshToken, { token: outcome.token, expiresAt: now() + ROTATED_REUSE_WINDOW_MS })
      }
      return outcome
    })
    .finally(() => {
      inflight.delete(refreshToken)
    })
  inflight.set(refreshToken, pending)
  return pending
}

/** 测试辅助：清空单飞锁表与旋转复用记录 */
export function resetRefreshInflight() {
  inflight.clear()
  rotated.clear()
}
