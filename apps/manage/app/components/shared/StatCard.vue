<script setup lang="ts">
/** 概览指标卡：标题 + 主数值 + 副标题说明 */
defineProps<{
  title: string
  value: string
  subtitle?: string
  icon?: string
}>()
</script>

<template>
  <UCard>
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-sm text-muted">
          {{ title }}
        </p>
        <p class="mt-1 truncate text-2xl font-semibold text-default">
          {{ value }}
        </p>
        <p v-if="subtitle" class="mt-1 text-xs text-muted">
          {{ subtitle }}
        </p>
      </div>
      <UIcon v-if="icon" :name="icon" class="size-5 shrink-0 text-primary" />
    </div>
  </UCard>
</template>
