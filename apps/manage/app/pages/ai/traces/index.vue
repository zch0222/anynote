<script setup lang="ts">
/**
 * Agent 运行列表：runId 前缀 / userId / 结果筛选，查询条件与页码同步 URL，点击进入 Trace 详情。
 */
import { useAgentRuns } from '~/composables/ai/useAgentRuns'
import QueryErrorState from '~/components/shared/QueryErrorState.vue'
import {
  RUN_OUTCOME_SELECT_ITEMS,
  buildRunListQuery,
  fromOutcomeSelectValue,
  parseRunListQuery,
  runOutcomeColor,
  toOutcomeSelectValue,
} from '~/lib/schemas/agent-trace'

const route = useRoute()
const router = useRouter()

const filters = reactive({
  runId: '',
  userId: '',
  outcome: '',
})
const page = ref(1)
const pageSize = 20

// 进入页面与浏览器前进 / 后退时以 URL 为准回填筛选与页码
watch(() => route.query, (query) => {
  const state = parseRunListQuery(query as Record<string, unknown>)
  filters.runId = state.runId
  filters.userId = state.userId
  filters.outcome = state.outcome
  page.value = state.page
}, { immediate: true })

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

function applyFilters() {
  page.value = 1
  router.replace({
    query: buildRunListQuery({ runId: filters.runId, userId: filters.userId, outcome: filters.outcome, page: 1 }),
  })
}

/** 结果下拉框的选中值：与筛选条件互转，改动后立即查询 */
const outcomeSelect = computed({
  get: () => toOutcomeSelectValue(filters.outcome),
  set: (value: string) => {
    filters.outcome = fromOutcomeSelectValue(value)
    applyFilters()
  },
})

/** 翻页写入 URL，浏览器前进 / 后退可逐页恢复 */
function onPageChange(next: number) {
  router.push({ query: buildRunListQuery({ ...filters, page: next }) })
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
        v-model="outcomeSelect"
        :items="RUN_OUTCOME_SELECT_ITEMS"
        value-key="value"
        class="w-36"
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
                <UBadge :color="runOutcomeColor(run.outcome)" variant="subtle" size="xs">
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
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
          size="sm"
          @update:page="onPageChange"
        />
      </div>
    </UCard>
  </div>
</template>
