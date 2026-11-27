/**
 * 超管会话状态：页面初始化与窗口聚焦时核验 /api/auth/me。
 * 浏览器永远接触不到令牌明文，Only 资料白名单进内存。
 */
import { useState } from '#imports'

export interface AdminSessionProfile {
  id?: number | null
  username?: string | null
  nickname?: string | null
  avatar?: string | null
  role?: { id?: number; roleKey?: string; roleName?: string } | null
}

interface MeEnvelope {
  code: string
  msg: string
  data: AdminSessionProfile | null
}

export function useAdminSession() {
  const profile = useState<AdminSessionProfile | null>('manage-admin-profile', () => null)
  const loaded = useState<boolean>('manage-admin-profile-loaded', () => false)
  const loading = useState<boolean>('manage-admin-profile-loading', () => false)

  async function refresh(): Promise<AdminSessionProfile | null> {
    if (loading.value) return profile.value
    loading.value = true
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

  function clear() {
    profile.value = null
    loaded.value = false
  }

  return { profile, loaded, loading, refresh, clear }
}
