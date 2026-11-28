/**
 * 超管会话复核：窗口聚焦与标签页重新可见时核验 /api/auth/me，
 * 会话失效时清空 Query 缓存并退回登录页。须在组件 setup 中调用。
 *
 * @author 称霸幼儿园
 */
import { useQueryClient } from '@tanstack/vue-query'
import { registerSessionRecheck, useAdminSession } from '~/composables/auth/useAdminSession'

export function useAdminSessionRecheck() {
  const session = useAdminSession()
  const queryClient = useQueryClient()

  // 会话一旦失效立即清空缓存，避免缓存里残留上一位管理员的数据
  watch(() => session.profile.value, (profile) => {
    if (profile == null) queryClient.clear()
  }, { flush: 'sync' })

  async function recheck() {
    if ((await session.recheckIfDue()) === 'invalid') await navigateTo('/login')
  }

  let stop: (() => void) | undefined
  onMounted(() => {
    stop = registerSessionRecheck({ window, document }, () => {
      void recheck()
    })
  })
  onBeforeUnmount(() => stop?.())
}
