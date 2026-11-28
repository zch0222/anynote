/**
 * 超管退出登录：调 BFF 注销 → 清空会话与 Query 缓存 → 回 /login。
 */
import { useQueryClient } from '@tanstack/vue-query'
import { useAdminSession } from '~/composables/auth/useAdminSession'

export function useAdminLogout() {
  const session = useAdminSession()
  const queryClient = useQueryClient()
  const pending = useState<boolean>('manage-admin-logout-pending', () => false)

  async function logout() {
    if (pending.value) return
    pending.value = true
    try {
      await $fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    } catch {
      // 上游失败不影响本地注销动作
    } finally {
      queryClient.clear()
      session.clear()
      pending.value = false
      await navigateTo('/login')
    }
  }

  return { logout, pending }
}
