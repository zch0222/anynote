<script setup lang="ts">
/** 通用空态 */
defineProps<{ text?: string; icon?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-10 text-muted">
    <UIcon :name="icon ?? 'i-lucide-inbox'" class="size-8" />
    <p class="text-sm">{{ text ?? '暂无数据' }}</p>
  </div>
</template>
