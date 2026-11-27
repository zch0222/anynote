/**
 * 全局路由守卫：未登录访问受保护页跳 /login（带同源 redirect 回跳），
 * 已登录访问 /login 直接进入 /ai/overview。
 */
import { defineNuxtRouteMiddleware, navigateTo } from '#imports'
import { useAdminSession } from '~/composables/auth/useAdminSession'

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useAdminSession()
  if (!session.loaded.value) {
    await session.refresh()
  }

  if (to.path === '/login') {
    if (session.profile.value) return navigateTo('/ai/overview')
    return
  }

  if (!session.profile.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
