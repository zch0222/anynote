<script setup lang="ts">
/** 应用根组件：挂载全局布局，并在窗口聚焦与标签页重新可见时复核超管会话 */
import { useAdminSessionRecheck } from '~/composables/auth/useAdminSessionRecheck'

useAdminSessionRecheck()
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
