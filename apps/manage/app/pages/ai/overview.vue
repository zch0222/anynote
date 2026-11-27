<script setup lang="ts">
/**
 * AI 运行概览看板：时间窗切换 + 6 张核心指标卡 + 趋势/分布图 + 异常运行速览。
 */
import { VisXYContainer, VisStackedBar, VisAxis, VisSingleContainer, VisDonut } from '@unovis/vue'
import { useAgentRunStats, useRecentFailedRuns } from '~/composables/ai/useAgentRunStats'
import { formatCount, formatMs, formatSuccessRate, type StatsWindowKey } from '~/lib/schemas/agent-stats'
import EmptyState from '~/components/shared/EmptyState.vue'
import QueryErrorState from '~/components/shared/QueryErrorState.vue'
import StatCard from '~/components/shared/StatCard.vue'

const windowKey = ref<StatsWindowKey>('7d')
const windowOptions = [
  { label: '近 24 小时', value: '24h' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
]

const stats = useAgentRunStats(windowKey)
const failedRuns = useRecentFailedRuns(windowKey)
const updatedAt = ref<string>('')

watch(stats.dataUpdatedAt, (ts) => {
  if (ts) updatedAt.value = new Date(ts).toLocaleTimeString()
}, { immediate: true })

async function refreshAll() {
  await Promise.all([stats.refetch(), failedRuns.refetch()])
}

const cards = computed(() => {
  const s = stats.data.value
  return [
    {
      title: '总运行次数',
      value: formatCount(s?.totalRuns ?? 0),
      subtitle: `运行中 ${formatCount(s?.runningRuns ?? 0)}`,
      icon: 'i-lucide-activity',
    },
    {
      title: '运行成功率',
      value: formatSuccessRate(s?.succeededRuns ?? 0, s?.totalRuns ?? 0),
      subtitle: `失败 ${formatCount(s?.failedRuns ?? 0)} · 取消 ${formatCount(s?.cancelledRuns ?? 0)}`,
      icon: 'i-lucide-circle-check',
    },
    {
      title: 'Token 总消耗',
      value: formatCount(s?.totalTokens ?? 0),
      subtitle: `输入 ${formatCount(s?.promptTokens ?? 0)} · 输出 ${formatCount(s?.completionTokens ?? 0)} · 推理 ${formatCount(s?.reasoningTokens ?? 0)}`,
      icon: 'i-lucide-coins',
    },
    {
      title: '首字响应耗时',
      value: formatMs(s?.avgFirstOutputMs ?? null),
      subtitle: `P95 ${formatMs(s?.p95FirstOutputMs ?? null)}`,
      icon: 'i-lucide-zap',
    },
    {
      title: '端到端总耗时',
      value: formatMs(s?.avgDurationMs ?? null),
      subtitle: `P95 ${formatMs(s?.p95DurationMs ?? null)}`,
      icon: 'i-lucide-timer',
    },
    {
      title: '工具调用强度',
      value: s?.avgToolCalls != null ? s.avgToolCalls.toFixed(2) : '—',
      subtitle: '单次运行平均工具调用次数',
      icon: 'i-lucide-wrench',
    },
  ]
})

interface SeriesPoint {
  bucketStart: string
  succeededRuns: number
  failedRuns: number
  totalRuns: number
}

const seriesData = computed<SeriesPoint[]>(() =>
  (stats.data.value?.series ?? []).map((bucket) => ({
    bucketStart: new Date(bucket.bucketStart as unknown as string).toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: windowKey.value === '24h' ? 'numeric' : undefined,
    }),
    succeededRuns: bucket.succeededRuns ?? 0,
    failedRuns: bucket.failedRuns ?? 0,
    totalRuns: bucket.totalRuns ?? 0,
  })),
)

const seriesX = (_d: SeriesPoint, i: number) => i
const seriesY = [(d: SeriesPoint) => d.succeededRuns, (d: SeriesPoint) => d.failedRuns]
const xTicks = (i: number) => seriesData.value[i]?.bucketStart ?? ''

interface ModelSlice {
  key: string
  runs: number
}

const modelData = computed<ModelSlice[]>(() =>
  (stats.data.value?.models ?? []).slice(0, 8).map((m) => ({
    key: `${m.provider ?? '?'} / ${m.model ?? '?'}`,
    runs: m.runs ?? 0,
  })),
)
const donutValue = (d: ModelSlice) => d.runs

const outcomeColor: Record<string, string> = {
  ANSWERED: 'success',
  NOT_FOUND: 'warning',
  NEEDS_CLARIFICATION: 'warning',
  FAILED: 'error',
  CANCELLED: 'neutral',
}

const failedColumns = [
  { accessorKey: 'runId', header: '运行标识' },
  { accessorKey: 'startedAt', header: '开始时间' },
  { accessorKey: 'outcome', header: '结果' },
  { accessorKey: 'durationMs', header: '耗时' },
  { accessorKey: 'model', header: '模型' },
]

const failedRows = computed(() => failedRuns.data.value ?? [])
const statsFetching = computed(() => stats.isFetching.value)
const statsIsError = computed(() => stats.isError.value)

function formatTime(input?: string) {
  if (!input) return '—'
  return new Date(input).toLocaleString()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <UTabs
        v-model="windowKey"
        :items="windowOptions"
        variant="pill"
        size="sm"
      />
      <div class="flex items-center gap-2">
        <span v-if="updatedAt" class="text-xs text-muted">更新于 {{ updatedAt }}</span>
        <UButton
          size="sm"
          variant="outline"
          icon="i-lucide-refresh-ccw"
          :loading="statsFetching"
          @click="refreshAll"
        >
          刷新
        </UButton>
      </div>
    </div>

    <QueryErrorState v-if="statsIsError" @retry="refreshAll" />

    <template v-else>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          v-for="card in cards"
          :key="card.title"
          :title="card.title"
          :value="card.value"
          :subtitle="card.subtitle"
          :icon="card.icon"
        />
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UCard class="xl:col-span-2">
          <template #header>
            <span class="text-sm font-medium text-default">运行量趋势</span>
          </template>
          <EmptyState v-if="!seriesData.length" />
          <VisXYContainer v-else :data="seriesData" :height="260">
            <VisStackedBar :x="seriesX" :y="seriesY" />
            <VisAxis type="x" :tick-format="xTicks" :num-ticks="6" />
            <VisAxis type="y" />
          </VisXYContainer>
        </UCard>

        <UCard>
          <template #header>
            <span class="text-sm font-medium text-default">模型调用分布</span>
          </template>
          <EmptyState v-if="!modelData.length" />
          <VisSingleContainer v-else :data="modelData" :height="260">
            <VisDonut :value="donutValue" />
          </VisSingleContainer>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <span class="text-sm font-medium text-default">近期异常运行</span>
        </template>
        <EmptyState v-if="!failedRows.length" text="当前时间窗内没有异常运行" />
        <UTable v-else :columns="failedColumns" :data="failedRows">
          <template #runId-cell="{ row }">
            <NuxtLink
              :to="`/ai/traces/${row.original.runId}`"
              class="font-mono text-xs text-primary hover:underline"
            >
              {{ row.original.runId?.slice(0, 8) }}
            </NuxtLink>
          </template>
          <template #startedAt-cell="{ row }">
            {{ formatTime(row.original.startedAt ?? undefined) }}
          </template>
          <template #outcome-cell="{ row }">
            <UBadge
              size="sm"
              variant="subtle"
              :color="(outcomeColor[row.original.outcome ?? ''] ?? 'neutral') as never"
            >
              {{ row.original.outcome }}
            </UBadge>
          </template>
          <template #durationMs-cell="{ row }">
            {{ formatMs(row.original.durationMs) }}
          </template>
          <template #model-cell="{ row }">
            <span class="text-xs">
              {{ row.original.provider }} / {{ row.original.model }}
            </span>
          </template>
        </UTable>
      </UCard>
    </template>
  </div>
</template>
