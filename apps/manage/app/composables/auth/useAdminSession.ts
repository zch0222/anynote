/**
 * 超管会话状态：页面初始化、路由跳转与窗口聚焦时核验 /api/auth/me。
 * 浏览器永远接触不到令牌明文，Only 资料白名单进内存。
 */
import { useState } from '#imports'

export interface AdminSessionProfile {
  id?: number | null
  username?: string | null
  nickname?: string | null
  avatar?: string | null
  role?: { id?: number, roleKey?: string, roleName?: string } | null
}

interface MeEnvelope {
  code: string
  msg: string
  data: AdminSessionProfile | null
}

/** 会话复核结论：有效、失效、暂不可用，未到期或未登录时跳过 */
export type SessionRecheckResult = 'valid' | 'invalid' | 'unavailable' | 'skipped'

/** 复核判定：有效带资料，失效带登录页提示文案，其余为暂不可用 */
export type SessionRecheckOutcome =
  | { kind: 'valid', profile: AdminSessionProfile }
  | { kind: 'invalid', message: string }
  | { kind: 'unavailable' }

/** 两次会话复核之间的最小间隔（毫秒） */
export const SESSION_RECHECK_INTERVAL_MS = 60_000

/** 会话失效且后端未给出文案时使用的提示 */
const SESSION_INVALID_MESSAGE = '登录状态已失效，请重新登录'

/**
 * 把 /api/auth/me 的响应或请求异常归类为复核结论。
 * @param response 接口响应，请求抛错时为 undefined
 * @param error 请求异常，请求成功时为 undefined
 * @return 复核结论
 */
export function resolveSessionRecheck(response?: MeEnvelope, error?: unknown): SessionRecheckOutcome {
  if (error !== undefined) {
    const failure = error as { status?: unknown, data?: { msg?: unknown } | null } | null
    if (failure?.status === 401 || failure?.status === 403) {
      const message = failure.data?.msg
      return {
        kind: 'invalid',
        message: typeof message === 'string' && message ? message : SESSION_INVALID_MESSAGE,
      }
    }
    return { kind: 'unavailable' }
  }
  if (response && response.code === '00000' && response.data) {
    return { kind: 'valid', profile: response.data }
  }
  // 业务成功却没有资料：后端没有可用文案，按默认提示处理
  if (!response || response.code === '00000') return { kind: 'invalid', message: SESSION_INVALID_MESSAGE }
  return { kind: 'invalid', message: response.msg || SESSION_INVALID_MESSAGE }
}

/**
 * 判断是否到期需要复核：已登录、没有在途复核且距上次核验满最小间隔。
 * @param state 当前复核状态
 * @param now 当前时间戳（毫秒）
 * @param intervalMs 最小间隔（毫秒）
 * @return 是否需要复核
 */
export function isSessionRecheckDue(
  state: { loggedIn: boolean, busy: boolean, lastAt: number },
  now: number,
  intervalMs = SESSION_RECHECK_INTERVAL_MS,
): boolean {
  if (!state.loggedIn || state.busy) return false
  return now - state.lastAt >= intervalMs
}

/**
 * 注册会话复核触发器：窗口聚焦与标签页重新可见时调用 onTrigger。
 * @param target 窗口与文档事件源
 * @param onTrigger 触发回调
 * @return 取消注册函数
 */
export function registerSessionRecheck(
  target: {
    window: Pick<Window, 'addEventListener' | 'removeEventListener'>
    document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
  },
  onTrigger: () => void,
): () => void {
  const onVisibilityChange = () => {
    if (target.document.visibilityState === 'visible') onTrigger()
  }
  target.window.addEventListener('focus', onTrigger)
  target.document.addEventListener('visibilitychange', onVisibilityChange)
  return () => {
    target.window.removeEventListener('focus', onTrigger)
    target.document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

export function useAdminSession() {
  const profile = useState<AdminSessionProfile | null>('manage-admin-profile', () => null)
  const loaded = useState<boolean>('manage-admin-profile-loaded', () => false)
  const loading = useState<boolean>('manage-admin-profile-loading', () => false)
  const recheck = useState<{ busy: boolean, lastAt: number }>('manage-admin-recheck', () => ({ busy: false, lastAt: 0 }))
  /** 会话失效后退回登录页时显示的提示，登录页取用后清空 */
  const notice = useState<string>('manage-admin-session-notice', () => '')

  async function refresh(): Promise<AdminSessionProfile | null> {
    if (loading.value) return profile.value
    loading.value = true
    recheck.value.lastAt = Date.now()
    try {
      const res = await $fetch<MeEnvelope>('/api/auth/me', { credentials: 'same-origin' })
      profile.value = res.code === '00000' ? res.data : null
    } catch {
      profile.value = null
    } finally {
      loaded.value = true
      loading.value = false
    }
    return profile.value
  }

  /** 会话失效：清空资料并标记已加载，路由守卫据此直接退回登录页且不再重复请求 */
  function markInvalid(message: string) {
    profile.value = null
    loaded.value = true
    notice.value = message
  }

  /**
   * 到期时复核会话：401、403 清空会话并记录登录页提示；网络错误或 5xx 不打断会话。
   * @param now 当前时间戳（毫秒），缺省取系统时间
   * @return 复核结论
   */
  async function recheckIfDue(now: number = Date.now()): Promise<SessionRecheckResult> {
    const due = isSessionRecheckDue(
      { loggedIn: profile.value != null, busy: recheck.value.busy, lastAt: recheck.value.lastAt },
      now,
    )
    if (!due) return 'skipped'
    recheck.value.busy = true
    recheck.value.lastAt = now
    let outcome: SessionRecheckOutcome
    try {
      outcome = resolveSessionRecheck(await $fetch<MeEnvelope>('/api/auth/me', { credentials: 'same-origin' }))
    } catch (error) {
      outcome = resolveSessionRecheck(undefined, error)
    }
    recheck.value.busy = false
    if (outcome.kind === 'unavailable') return 'unavailable'
    if (outcome.kind === 'valid') {
      profile.value = outcome.profile
      return 'valid'
    }
    markInvalid(outcome.message)
    return 'invalid'
  }

  function clear() {
    profile.value = null
    loaded.value = false
    notice.value = ''
  }

  return { profile, loaded, loading, notice, refresh, recheckIfDue, markInvalid, clear }
}
