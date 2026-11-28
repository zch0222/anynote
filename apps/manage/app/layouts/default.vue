<script setup lang="ts">
/**
 * 默认后台外壳：UDashboardGroup + 可折叠侧栏 + 顶栏面包屑 + ⌘K 命令面板。
 */
import AppSidebar from '~/components/layout/AppSidebar.vue'

const route = useRoute()
const paletteOpen = ref(false)

const PAGE_TITLES: Record<string, string> = {
  '/ai/overview': '运行概览',
  '/ai/models': '模型与供应商',
  '/ai/retrieval': '知识检索参数',
  '/ai/traces': '运行轨迹 (Trace)',
}

const breadcrumbs = computed(() => {
  const items = [{ label: 'AI 服务治理' }]
  if (route.path.startsWith('/ai/traces/')) {
    items.push({ label: '运行轨迹 (Trace)', to: '/ai/traces' } as never)
    items.push({ label: `运行 ${route.params.runId?.toString().slice(0, 8) ?? ''}` } as never)
    return items
  }
  const title = PAGE_TITLES[route.path]
  if (title) items.push({ label: title } as never)
  return items
})

const paletteGroups = computed(() => [
  {
    id: 'nav',
    label: '导航',
    items: [
      {
        label: '运行概览',
        icon: 'i-lucide-layout-dashboard',
        onSelect: () => go('/ai/overview'),
      },
      {
        label: '模型与供应商',
        icon: 'i-lucide-cpu',
        onSelect: () => go('/ai/models'),
      },
      {
        label: '知识检索参数',
        icon: 'i-lucide-sliders-horizontal',
        onSelect: () => go('/ai/retrieval'),
      },
      {
        label: '运行轨迹 (Trace)',
        icon: 'i-lucide-git-branch',
        onSelect: () => go('/ai/traces'),
      },
    ],
  },
])

async function go(to: string) {
  paletteOpen.value = false
  await navigateTo(to)
}

defineShortcuts({
  meta_k: () => {
    paletteOpen.value = !paletteOpen.value
  },
})
</script>

<template>
  <UDashboardGroup>
    <AppSidebar />
    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar>
          <template #leading>
            <UDashboardSidebarCollapse variant="subtle" />
          </template>
          <template #title>
            <UBreadcrumb :items="breadcrumbs" />
          </template>
          <template #right>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              icon="i-lucide-search"
              @click="paletteOpen = true"
            >
              <span class="hidden sm:inline">快捷导航</span>
              <UKbd>⌘K</UKbd>
            </UButton>
          </template>
        </UDashboardNavbar>
      </template>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <slot />
      </div>
    </UDashboardPanel>

    <UModal v-model:open="paletteOpen" title="快捷导航" description="搜索并跳转到管理页面">
      <template #content>
        <UCommandPalette
          :groups="paletteGroups"
          placeholder="搜索页面…"
          close
          @update:open="paletteOpen = $event"
        />
      </template>
    </UModal>
  </UDashboardGroup>
</template>
