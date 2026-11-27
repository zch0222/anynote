<script setup lang="ts">
/**
 * 侧栏底部超管账号卡片与退出菜单。
 */
import { useAdminLogout } from '~/composables/auth/useAdminLogout'
import { useAdminSession } from '~/composables/auth/useAdminSession'

const session = useAdminSession()
const { logout, pending } = useAdminLogout()

const displayName = computed(
  () => session.profile.value?.nickname || session.profile.value?.username || '—',
)

const items = computed(() => [
  [
    {
      label: '退出登录',
      icon: 'i-lucide-log-out',
      onSelect: () => logout(),
    },
  ],
])
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'start', side: 'top' }">
    <UButton
      color="neutral"
      variant="ghost"
      block
      :loading="pending"
      class="justify-start"
    >
      <template #leading>
        <UAvatar :alt="displayName" size="xs" />
      </template>
      <span class="truncate">{{ displayName }}</span>
    </UButton>
  </UDropdownMenu>
</template>
