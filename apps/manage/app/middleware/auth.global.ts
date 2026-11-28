/**
 * 全局路由守卫：未登录访问受保护页跳 /login（带同源 redirect 回跳），
 * 已登录访问 /login 直接进入 /ai/overview；已登录跳转受保护页时按节流间隔复核会话。
 */
import { defineNuxtRouteMiddleware, navigateTo } from '#imports'
import { useAdminSession } from '~/composables/auth/useAdminSession'

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useAdminSession()
  if (!session.loaded.value) {
    await session.refresh()
  } else if (to.path !== '/login') {
    // 复核失权后资料被清空，走下方的未登录跳转
    await session.recheckIfDue()
  }

  if (to.path === '/login') {
    if (session.profile.value) return navigateTo('/ai/overview')
    return
  }

  if (!session.profile.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
