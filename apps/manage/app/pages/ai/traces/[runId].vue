<script setup lang="ts">
/**
 * Trace 详情工作台：运行摘要、审计告知、瀑布图、分轮导航与六页签检查器。
 */
import QueryErrorState from '~/components/shared/QueryErrorState.vue'
import TraceInspector from '~/components/ai/traces/TraceInspector.vue'
import TraceRoundList from '~/components/ai/traces/TraceRoundList.vue'
import TraceWaterfall from '~/components/ai/traces/TraceWaterfall.vue'
import { useAgentRunDetail, useAgentRunEvents } from '~/composables/ai/useAgentRuns'
import { buildTraceTimeline } from '~/lib/trace/buildTraceTimeline'
import { runOutcomeColor } from '~/lib/schemas/agent-trace'

const route = useRoute()
const runId = computed(() => String(route.params.runId))

const detailQuery = useAgentRunDetail(runId)
const eventsQuery = useAgentRunEvents(runId)

const timeline = computed(() => buildTraceTimeline(eventsQuery.data.value?.events ?? []))
const run = computed(() => detailQuery.data.value?.run)

function formatMs(ms?: number | null) {
  if (ms == null) return '-'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
      <UButton to="/ai/traces" variant="ghost" icon="i-lucide-arrow-left" size="sm">
        返回列表
      </UButton>
      <h2 class="font-mono text-sm text-default">{{ runId }}</h2>
    </div>

    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-shield-check"
      title="本次访问已记录审计日志，请按最小必要原则查看用户内容"
    />

    <QueryErrorState v-if="detailQuery.isError.value" @retry="detailQuery.refetch()" />

    <UCard v-else-if="run" :ui="{ body: 'p-4' }">
      <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-7">
        <div><p class="text-xs text-muted">用户</p><p class="font-medium">{{ run.userId ?? '-' }}</p></div>
        <div><p class="text-xs text-muted">模型</p><p class="font-medium">{{ run.model ?? '-' }}</p></div>
        <div>
          <p class="text-xs text-muted">结果</p>
          <UBadge
            :color="runOutcomeColor(run.outcome)"
            variant="subtle"
            size="xs"
          >
            {{ run.outcome ?? run.state ?? '-' }}
          </UBadge>
        </div>
        <div><p class="text-xs text-muted">总耗时</p><p class="font-medium">{{ formatMs(run.durationMs) }}</p></div>
        <div><p class="text-xs text-muted">首字延迟</p><p class="font-medium">{{ formatMs(run.firstOutputMs) }}</p></div>
        <div><p class="text-xs text-muted">工具调用</p><p class="font-medium">{{ run.toolCalls ?? 0 }}</p></div>
        <div><p class="text-xs text-muted">Tokens</p><p class="font-medium">{{ run.tokenUsage?.totalTokens ?? '-' }}</p></div>
      </div>
    </UCard>

    <UAlert
      v-if="eventsQuery.data.value?.truncated"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="运行事件过多，仅加载前 5000 条"
    />
    <QueryErrorState v-if="eventsQuery.isError.value" @retry="eventsQuery.refetch()" />
    <div v-else-if="eventsQuery.isPending.value" class="py-10 text-center text-sm text-muted">
      加载事件中…
    </div>

    <template v-else-if="timeline.eventCount">
      <UCard>
        <template #header>
          <h3 class="text-sm font-medium text-default">时间瀑布</h3>
        </template>
        <TraceWaterfall :timeline="timeline" />
      </UCard>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <UCard :ui="{ body: 'p-3' }">
          <template #header>
            <h3 class="text-sm font-medium text-default">分轮导航</h3>
          </template>
          <TraceRoundList :rounds="timeline.rounds" />
        </UCard>
        <UCard class="xl:col-span-2" :ui="{ body: 'p-3' }">
          <template #header>
            <h3 class="text-sm font-medium text-default">检查器</h3>
          </template>
          <TraceInspector
            :events="eventsQuery.data.value?.events ?? []"
            :rounds="timeline.rounds"
            :detail="detailQuery.data.value"
          />
        </UCard>
      </div>
    </template>
    <p v-else class="py-10 text-center text-sm text-muted">暂无数据</p>
  </div>
</template>
