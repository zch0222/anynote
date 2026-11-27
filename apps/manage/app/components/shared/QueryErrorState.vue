<script setup lang="ts">
/** 查询错误态：加载失败提示 + 重试按钮 */
defineProps<{ message?: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-10">
    <UIcon name="i-lucide-cloud-off" class="size-8 text-muted" />
    <p class="text-sm text-muted">{{ message ?? '加载失败，请稍后重试' }}</p>
    <UButton size="sm" variant="outline" icon="i-lucide-refresh-ccw" @click="emit('retry')">
      重试
    </UButton>
  </div>
</template>
