<script setup lang="ts">
/**
 * 后台侧边导航：品牌标识 + AI 服务治理与平台系统菜单 + 底部主题切换与账号卡片。
 */
import AdminUserMenu from '~/components/layout/AdminUserMenu.vue'

const collapsed = defineModel<boolean>('collapsed', { default: false })

const navigationItems = [
  {
    label: 'AI 服务治理',
    type: 'label' as const,
  },
  { label: '运行概览', icon: 'i-lucide-layout-dashboard', to: '/ai/overview' },
  { label: '模型与供应商', icon: 'i-lucide-cpu', to: '/ai/models' },
  { label: '知识检索参数', icon: 'i-lucide-sliders-horizontal', to: '/ai/retrieval' },
  { label: '运行轨迹 (Trace)', icon: 'i-lucide-git-branch', to: '/ai/traces' },
  {
    label: '平台与系统',
    type: 'label' as const,
  },
  { label: '用户管理', icon: 'i-lucide-users', to: '/system/users' },
]

const deploymentEnv = computed(() =>
  import.meta.dev || (typeof window !== 'undefined' && window.location.hostname === 'localhost')
    ? 'DEV'
    : 'PROD',
)
</script>

<template>
  <UDashboardSidebar
    v-model:collapsed="collapsed"
    collapsible
    resizable
    :min-size="12"
    :max-size="22"
    :default-size="16"
    class="bg-elevated/50"
  >
    <template #header="{ collapsed: isCollapsed }">
      <div class="flex items-center gap-2 px-1">
        <UIcon name="i-lucide-shield-check" class="size-5 shrink-0 text-primary" />
        <template v-if="!isCollapsed">
          <span class="truncate font-semibold text-default">Anynote Admin</span>
          <UBadge size="xs" variant="subtle" :color="deploymentEnv === 'DEV' ? 'warning' : 'error'">
            {{ deploymentEnv }}
          </UBadge>
        </template>
      </div>
    </template>

    <template #default="{ collapsed: isCollapsed }">
      <UNavigationMenu
        :items="navigationItems"
        orientation="vertical"
        :collapsed="isCollapsed"
        tooltip
      />
    </template>

    <template #footer="{ collapsed: isCollapsed }">
      <div class="flex flex-col gap-2" :class="isCollapsed ? 'items-center' : ''">
        <UColorModeButton size="sm" />
        <AdminUserMenu v-if="!isCollapsed" />
      </div>
    </template>
  </UDashboardSidebar>
</template>
