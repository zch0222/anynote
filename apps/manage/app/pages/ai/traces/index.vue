<script setup lang="ts">
/**
 * Agent 运行列表：runId 前缀 / userId / 结果筛选，查询条件同步 URL，点击进入 Trace 详情。
 */
import { useAgentRuns } from '~/composables/ai/useAgentRuns'
import QueryErrorState from '~/components/shared/QueryErrorState.vue'

const route = useRoute()
const router = useRouter()

const filters = reactive({
  runId: (route.query.runId as string) ?? '',
  userId: (route.query.userId as string) ?? '',
  outcome: (route.query.outcome as string) ?? '',
})
const page = ref(Number(route.query.page) || 1)
const pageSize = 20

const queryParams = computed(() => ({
  runId: filters.runId || undefined,
  userId: filters.userId || undefined,
  outcome: filters.outcome || undefined,
  page: page.value,
  pageSize,
}))
const runsQuery = useAgentRuns(queryParams)

const records = computed(() => runsQuery.data.value?.rows ?? [])
const total = computed(() => runsQuery.data.value?.total ?? 0)

const outcomeOptions = [
  { label: '全部结果', value: '' },
  { label: '成功', value: 'SUCCESS' },
  { label: '失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELLED' },
]

function applyFilters() {
  page.value = 1
  router.replace({ query: {
    ...(filters.runId ? { runId: filters.runId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
  } })
}

function outcomeColor(outcome?: string | null) {
  if (outcome === 'SUCCESS') return 'success' as const
  if (outcome === 'FAILED') return 'error' as const
  if (outcome === 'CANCELLED') return 'neutral' as const
  return 'info' as const
}

function formatMs(ms?: number | null) {
  if (ms == null) return '-'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end gap-3">
      <UInput v-model="filters.runId" placeholder="runId 前缀" class="w-52" @keydown.enter="applyFilters" />
      <UInput v-model="filters.userId" placeholder="用户 ID" class="w-32" inputmode="numeric" @keydown.enter="applyFilters" />
      <USelect
        v-model="filters.outcome"
        :items="outcomeOptions"
        value-key="value"
        class="w-36"
        @update:model-value="applyFilters"
      />
      <UButton icon="i-lucide-search" :loading="runsQuery.isFetching.value" @click="applyFilters">
        查询
      </UButton>
    </div>

    <QueryErrorState v-if="runsQuery.isError.value" @retry="runsQuery.refetch()" />

    <UCard v-else :ui="{ body: 'p-0' }">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-xs text-muted">
              <th class="px-4 py-2 font-medium">runId</th>
              <th class="px-4 py-2 font-medium">用户</th>
              <th class="px-4 py-2 font-medium">模型</th>
              <th class="px-4 py-2 font-medium">结果</th>
              <th class="px-4 py-2 font-medium">耗时</th>
              <th class="px-4 py-2 font-medium">工具调用</th>
              <th class="px-4 py-2 font-medium">Tokens</th>
              <th class="px-4 py-2 font-medium">开始时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!records.length && !runsQuery.isPending.value">
              <td colspan="8" class="px-4 py-10 text-center text-muted">暂无数据</td>
            </tr>
            <tr
              v-for="run in records"
              :key="run.runId ?? ''"
              class="cursor-pointer border-b border-default last:border-0 hover:bg-elevated/50"
              @click="router.push(`/ai/traces/${run.runId}`)"
            >
              <td class="px-4 py-2 font-mono text-xs">{{ run.runId?.slice(0, 8) }}…</td>
              <td class="px-4 py-2">{{ run.userId ?? '-' }}</td>
              <td class="px-4 py-2">{{ run.model ?? '-' }}</td>
              <td class="px-4 py-2">
                <UBadge :color="outcomeColor(run.outcome)" variant="subtle" size="xs">
                  {{ run.outcome ?? run.state ?? '-' }}
                </UBadge>
              </td>
              <td class="px-4 py-2">{{ formatMs(run.durationMs) }}</td>
              <td class="px-4 py-2">{{ run.toolCalls ?? 0 }}</td>
              <td class="px-4 py-2">{{ run.tokenUsage?.totalTokens ?? '-' }}</td>
              <td class="px-4 py-2 text-xs text-muted">{{ run.startedAt ? new Date(run.startedAt).toLocaleString() : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="total > pageSize" class="flex justify-end border-t border-default px-4 py-2">
        <UPagination v-model:page="page" :total="total" :items-per-page="pageSize" size="sm" />
      </div>
    </UCard>
  </div>
</template>
