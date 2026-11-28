<script setup lang="ts">
/**
 * 模型供应商目录表格：展示关键列与编辑/删除操作。
 */
import type { ModelProvider } from '~/lib/schemas/model-provider'

const props = defineProps<{
  providers: ModelProvider[]
  loading?: boolean
}>()

const emit = defineEmits<{
  edit: [provider: ModelProvider]
  delete: [provider: ModelProvider]
}>()

const columns = [
  { accessorKey: 'displayName', header: '供应商' },
  { accessorKey: 'providerKey', header: '标识' },
  { accessorKey: 'models', header: '模型' },
  { accessorKey: 'dataEgressAllowed', header: '数据出境' },
  { accessorKey: 'processReasoningMaxChars', header: '思考截断' },
  { accessorKey: 'enabled', header: '状态' },
  { accessorKey: 'updateTime', header: '更新时间' },
  { id: 'actions', header: '操作' },
]

function formatTime(input?: string | null) {
  if (!input) return '—'
  return new Date(input).toLocaleString()
}

void props
</script>

<template>
  <UTable :columns="columns" :data="providers" :loading="loading">
    <template #displayName-cell="{ row }">
      <div class="min-w-0">
        <p class="truncate font-medium text-default">{{ row.original.displayName }}</p>
        <p class="truncate text-xs text-muted">{{ row.original.baseUrl }}</p>
      </div>
    </template>
    <template #providerKey-cell="{ row }">
      <span class="font-mono text-xs">{{ row.original.providerKey }}</span>
    </template>
    <template #models-cell="{ row }">
      <div class="flex max-w-56 flex-wrap gap-1">
        <UBadge
          v-for="model in row.original.models.slice(0, 3)"
          :key="model"
          size="sm"
          variant="outline"
          color="neutral"
        >
          {{ model }}
        </UBadge>
        <UBadge v-if="row.original.models.length > 3" size="sm" variant="subtle" color="neutral">
          +{{ row.original.models.length - 3 }}
        </UBadge>
      </div>
    </template>
    <template #dataEgressAllowed-cell="{ row }">
      <UBadge size="sm" variant="subtle" :color="row.original.dataEgressAllowed ? 'warning' : 'success'">
        {{ row.original.dataEgressAllowed ? '允许出境' : '禁止出境' }}
      </UBadge>
    </template>
    <template #processReasoningMaxChars-cell="{ row }">
      {{ row.original.processReasoningMaxChars }}
    </template>
    <template #enabled-cell="{ row }">
      <UBadge size="sm" variant="subtle" :color="row.original.enabled ? 'success' : 'neutral'">
        {{ row.original.enabled ? '启用' : '停用' }}
      </UBadge>
    </template>
    <template #updateTime-cell="{ row }">
      <span class="text-xs text-muted">{{ formatTime(row.original.updateTime) }}</span>
    </template>
    <template #actions-cell="{ row }">
      <div class="flex gap-1">
        <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="emit('edit', row.original)" />
        <UButton
          size="xs"
          variant="ghost"
          color="error"
          icon="i-lucide-trash-2"
          @click="emit('delete', row.original)"
        />
      </div>
    </template>
  </UTable>
</template>
