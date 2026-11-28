/**
 * 超管会话复核单测：复核结论归类、节流判定、触发器注册与到期复核流程。
 *
 * @author 称霸幼儿园
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import {
  SESSION_RECHECK_INTERVAL_MS,
  isSessionRecheckDue,
  registerSessionRecheck,
  resolveSessionRecheck,
  useAdminSession,
  type AdminSessionProfile,
} from '~/composables/auth/useAdminSession'
import { resetUseStateRegistry } from '../stubs/imports'

const fetchMock = vi.fn()

const ADMIN: AdminSessionProfile = { id: 1, username: 'root', nickname: '超管', role: { id: 1, roleKey: 'ADMIN_X' } }

/** 模拟 $fetch 对非 2xx 响应抛出的错误 */
function httpError(status: number, msg?: string) {
  return Object.assign(new Error(`[${status}]`), {
    status,
    statusCode: status,
    data: msg === undefined ? undefined : { code: 'x', msg, data: null },
  })
}

let scope: EffectScope | undefined

/** 登录后的会话状态：首次 /api/auth/me 返回超管资料 */
async function loggedInSession() {
  fetchMock.mockResolvedValueOnce({ code: '00000', msg: '操作成功', data: ADMIN })
  scope = effectScope()
  const session = scope.run(() => useAdminSession())!
  await session.refresh()
  return session
}

beforeEach(() => {
  resetUseStateRegistry()
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
})

afterEach(() => {
  scope?.stop()
  scope = undefined
  vi.unstubAllGlobals()
})

describe('resolveSessionRecheck', () => {
  it('成功响应带资料为有效', () => {
    expect(resolveSessionRecheck({ code: '00000', msg: '操作成功', data: ADMIN })).toEqual({ kind: 'valid', profile: ADMIN })
  })

  it('401、403 为会话失效并带出后端文案', () => {
    expect(resolveSessionRecheck(undefined, httpError(401, '登录状态已失效，请重新登录'))).toEqual({
      kind: 'invalid',
      message: '登录状态已失效，请重新登录',
    })
    expect(resolveSessionRecheck(undefined, httpError(403, '仅超级管理员可登录管理后台'))).toEqual({
      kind: 'invalid',
      message: '仅超级管理员可登录管理后台',
    })
  })

  it('后端未给出文案时使用默认提示', () => {
    expect(resolveSessionRecheck(undefined, httpError(401))).toEqual({
      kind: 'invalid',
      message: '登录状态已失效，请重新登录',
    })
    expect(resolveSessionRecheck(undefined, httpError(403, ''))).toEqual({
      kind: 'invalid',
      message: '登录状态已失效，请重新登录',
    })
  })

  it('5xx 与网络错误为暂不可用', () => {
    expect(resolveSessionRecheck(undefined, httpError(502, '认证服务暂时不可用'))).toEqual({ kind: 'unavailable' })
    expect(resolveSessionRecheck(undefined, new Error('network'))).toEqual({ kind: 'unavailable' })
    expect(resolveSessionRecheck(undefined, httpError(500))).toEqual({ kind: 'unavailable' })
  })

  it('响应未成功或没有资料为失效', () => {
    expect(resolveSessionRecheck({ code: 'A0301', msg: '仅超级管理员可登录管理后台', data: null })).toEqual({
      kind: 'invalid',
      message: '仅超级管理员可登录管理后台',
    })
    expect(resolveSessionRecheck({ code: '00000', msg: '操作成功', data: null })).toEqual({
      kind: 'invalid',
      message: '登录状态已失效，请重新登录',
    })
  })
})

describe('isSessionRecheckDue', () => {
  const base = { loggedIn: true, busy: false, lastAt: 1_000_000 }

  it('未登录或有在途复核时不复核', () => {
    expect(isSessionRecheckDue({ ...base, loggedIn: false }, 1_000_000 + SESSION_RECHECK_INTERVAL_MS)).toBe(false)
    expect(isSessionRecheckDue({ ...base, busy: true }, 1_000_000 + SESSION_RECHECK_INTERVAL_MS)).toBe(false)
  })

  it('距上次核验不足间隔时不复核，满间隔后复核', () => {
    expect(isSessionRecheckDue(base, 1_000_000 + SESSION_RECHECK_INTERVAL_MS - 1)).toBe(false)
    expect(isSessionRecheckDue(base, 1_000_000 + SESSION_RECHECK_INTERVAL_MS)).toBe(true)
  })
})

describe('registerSessionRecheck', () => {
  /** 可派发事件的窗口与文档事件源 */
  function targets() {
    const win = new EventTarget()
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    return { win: win as never, doc: doc as never, raw: doc }
  }

  it('窗口聚焦与标签页重新可见时触发，标签页隐藏时不触发', () => {
    const { win, doc, raw } = targets()
    const onTrigger = vi.fn()
    registerSessionRecheck({ window: win, document: doc }, onTrigger)

    raw.visibilityState = 'hidden'
    raw.dispatchEvent(new Event('visibilitychange'))
    expect(onTrigger).not.toHaveBeenCalled()

    raw.visibilityState = 'visible'
    raw.dispatchEvent(new Event('visibilitychange'))
    ;(win as unknown as EventTarget).dispatchEvent(new Event('focus'))
    expect(onTrigger).toHaveBeenCalledTimes(2)
  })

  it('取消注册后不再触发', () => {
    const { win, doc, raw } = targets()
    const onTrigger = vi.fn()
    const dispose = registerSessionRecheck({ window: win, document: doc }, onTrigger)

    dispose()
    raw.dispatchEvent(new Event('visibilitychange'))
    ;(win as unknown as EventTarget).dispatchEvent(new Event('focus'))
    expect(onTrigger).not.toHaveBeenCalled()
  })
})

describe('useAdminSession.recheckIfDue', () => {
  it('登录后满间隔才复核；角色被撤销时清空会话并记录登录页提示', async () => {
    const session = await loggedInSession()
    fetchMock.mockRejectedValueOnce(httpError(403, '仅超级管理员可登录管理后台'))

    expect(await session.recheckIfDue(Date.now() + 1000)).toBe('skipped')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    expect(await session.recheckIfDue(Date.now() + SESSION_RECHECK_INTERVAL_MS)).toBe('invalid')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/auth/me')
    expect(session.profile.value).toBeNull()
    expect(session.loaded.value).toBe(true)
    expect(session.notice.value).toBe('仅超级管理员可登录管理后台')
  })

  it('会话失效后再次到期也不重复请求', async () => {
    const session = await loggedInSession()
    fetchMock.mockRejectedValueOnce(httpError(401, '登录状态已失效，请重新登录'))
    await session.recheckIfDue(Date.now() + SESSION_RECHECK_INTERVAL_MS)

    expect(await session.recheckIfDue(Date.now() + SESSION_RECHECK_INTERVAL_MS * 3)).toBe('skipped')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('暂不可用时保持会话，下次复核有效则更新资料', async () => {
    const session = await loggedInSession()
    fetchMock
      .mockRejectedValueOnce(httpError(502, '认证服务暂时不可用'))
      .mockResolvedValueOnce({ code: '00000', msg: '操作成功', data: { ...ADMIN, nickname: '新昵称' } })

    expect(await session.recheckIfDue(Date.now() + SESSION_RECHECK_INTERVAL_MS)).toBe('unavailable')
    expect(session.profile.value?.username).toBe('root')
    expect(session.notice.value).toBe('')

    expect(await session.recheckIfDue(Date.now() + SESSION_RECHECK_INTERVAL_MS * 2)).toBe('valid')
    expect(session.profile.value?.nickname).toBe('新昵称')
  })

  it('未登录时不复核', async () => {
    scope = effectScope()
    const session = scope.run(() => useAdminSession())!

    expect(await session.recheckIfDue(Number.MAX_SAFE_INTEGER)).toBe('skipped')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('复核在途时不重复请求', async () => {
    const session = await loggedInSession()
    let finish: (value: unknown) => void = () => {}
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))

    const inflight = session.recheckIfDue(Date.now() + SESSION_RECHECK_INTERVAL_MS)
    expect(await session.recheckIfDue(Date.now() + SESSION_RECHECK_INTERVAL_MS * 2)).toBe('skipped')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    finish({ code: '00000', msg: '操作成功', data: ADMIN })
    expect(await inflight).toBe('valid')
  })
})
