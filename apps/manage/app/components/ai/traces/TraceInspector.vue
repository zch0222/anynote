<script setup lang="ts">
/**
 * Trace 检查器：概要 / 上下文 / 模型输出 / 工具诊断 / 原始 JSON / 用户视图对比。
 * 工具诊断按单次调用展开；用户视图对比带出对象、结果条目与完整全文，供脱敏核验。
 */
import JsonTreeView from './JsonTreeView.vue'
import { buildProcessCompareRows, type ProcessCompareRow } from '~/lib/trace/buildProcessCompare'
import { listToolCalls, type TraceRound } from '~/lib/trace/buildTraceTimeline'
import { buildBlobIndex, parseContextManifest, resolveContextEntries } from '~/lib/trace/resolveContextBlobs'
import type { AgentRunDetail, ParsedTraceEvent } from '~/lib/schemas/agent-trace'

const props = defineProps<{
  events: ParsedTraceEvent[]
  rounds: TraceRound[]
  detail?: AgentRunDetail | null
}>()

/** 用户视图文字折叠时显示的长度 */
const TEXT_PREVIEW_LENGTH = 300

const activeTab = ref('summary')
const expandedKey = ref<string | null>(null)
/** 用户视图中展开全文的行键 */
const expandedText = ref<string | null>(null)

const tabs = [
  { label: '概要', value: 'summary' },
  { label: '上下文', value: 'context' },
  { label: '模型输出', value: 'model' },
  { label: '工具诊断', value: 'tools' },
  { label: '原始 JSON', value: 'raw' },
  { label: '用户视图对比', value: 'compare' },
]

const blobIndex = computed(() => buildBlobIndex(props.events))

const contextRows = computed(() =>
  props.rounds
    .filter((r) => r.contextEvent)
    .map((r) => ({
      turn: r.turn,
      entries: resolveContextEntries(parseContextManifest(r.contextEvent), blobIndex.value),
    })),
)

const modelEvents = computed(() =>
  props.rounds.filter((r) => r.modelEvent).map((r) => ({ turn: r.turn, event: r.modelEvent! })),
)
/** 同一轮的并行工具调用打包在同一个事件里，按单次调用展开 */
const toolCalls = computed(() => listToolCalls(props.rounds))

const summaryStats = computed(() => {
  const verify = props.rounds.map((r) => r.verifyPassed).filter((v) => v != null)
  return {
    rounds: props.rounds.filter((r) => r.turn > 0).length || props.rounds.length,
    modelCalls: modelEvents.value.length,
    toolCalls: props.rounds.reduce((n, r) => n + r.toolCalls, 0),
    verifyPassed: verify.length ? verify.every(Boolean) : null,
    eventCount: props.events.length,
  }
})

const processRows = computed<ProcessCompareRow[]>(() => buildProcessCompareRows(props.detail?.process?.items))

function entryKey(turn: number, index: number) {
  return `${turn}:${index}`
}
function toggleEntry(key: string) {
  expandedKey.value = expandedKey.value === key ? null : key
}
function toggleText(key: string) {
  expandedText.value = expandedText.value === key ? null : key
}
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap gap-1">
      <UButton
        v-for="tab in tabs"
        :key="tab.value"
        size="xs"
        :variant="activeTab === tab.value ? 'solid' : 'ghost'"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
      </UButton>
    </div>

    <div v-if="activeTab === 'summary'" class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
      <div><p class="text-xs text-muted">轮次</p><p class="font-medium">{{ summaryStats.rounds }}</p></div>
      <div><p class="text-xs text-muted">模型调用</p><p class="font-medium">{{ summaryStats.modelCalls }}</p></div>
      <div><p class="text-xs text-muted">工具调用</p><p class="font-medium">{{ summaryStats.toolCalls }}</p></div>
      <div>
        <p class="text-xs text-muted">结果校验</p>
        <p class="font-medium">{{ summaryStats.verifyPassed == null ? '-' : summaryStats.verifyPassed ? '全部通过' : '存在未通过' }}</p>
      </div>
      <div><p class="text-xs text-muted">事件数</p><p class="font-medium">{{ summaryStats.eventCount }}</p></div>
    </div>

    <div v-else-if="activeTab === 'context'" class="space-y-3">
      <p v-if="!contextRows.length" class="text-sm text-muted">暂无数据</p>
      <div v-for="row in contextRows" :key="row.turn">
        <h4 class="mb-1 text-xs font-medium text-muted">第 {{ row.turn }} 轮上下文（{{ row.entries.length }} 层）</h4>
        <div class="space-y-1">
          <div v-for="(entry, i) in row.entries" :key="i" class="rounded border border-default">
            <button
              type="button"
              class="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-elevated/50"
              @click="toggleEntry(entryKey(row.turn, i))"
            >
              <span class="font-mono">{{ entry.scope }}/{{ entry.sourceType }} · {{ entry.transform ?? '-' }}</span>
              <span class="text-muted">{{ entry.tokenCount ?? '?' }} Token</span>
            </button>
            <div v-if="expandedKey === entryKey(row.turn, i)" class="border-t border-default p-2">
              <pre v-if="entry.content != null" class="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{{ entry.content }}</pre>
              <UAlert v-else color="warning" variant="subtle" :title="entry.missingReason ?? '该层上下文原文缺失或哈希未登记'" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="activeTab === 'model'" class="space-y-3">
      <p v-if="!modelEvents.length" class="text-sm text-muted">暂无数据</p>
      <UCard v-for="row in modelEvents" :key="row.turn" :ui="{ body: 'p-3' }">
        <p class="mb-1 text-xs font-medium text-muted">第 {{ row.turn }} 轮模型调用</p>
        <JsonTreeView :value="row.event.span.attributes ?? {}" />
      </UCard>
    </div>

    <div v-else-if="activeTab === 'tools'" class="space-y-3">
      <p v-if="!toolCalls.length" class="text-sm text-muted">暂无数据</p>
      <UCard v-for="row in toolCalls" :key="row.key" :ui="{ body: 'p-3' }">
        <p class="mb-1 text-xs font-medium text-muted">第 {{ row.turn }} 轮 · {{ row.tool }}</p>
        <JsonTreeView :value="row.value" />
      </UCard>
    </div>

    <div v-else-if="activeTab === 'raw'">
      <JsonTreeView :value="events.map((e) => ({ seq: e.seq, type: e.type, ...e.span }))" />
    </div>

    <div v-else-if="activeTab === 'compare'" class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <h4 class="mb-2 text-xs font-medium text-muted">管理员视角（事件流摘要）</h4>
        <div class="max-h-96 space-y-1 overflow-auto rounded border border-default p-2">
          <p v-for="e in events.slice(0, 80)" :key="e.seq" class="font-mono text-xs">
            <span class="text-muted">#{{ e.seq }}</span> {{ e.type.replace('trace.', '') }} {{ e.span.name ?? '' }}
          </p>
        </div>
      </div>
      <div>
        <h4 class="mb-2 text-xs font-medium text-muted">用户视角（process 过程视图）</h4>
        <div v-if="processRows.length" class="max-h-96 space-y-2 overflow-auto rounded border border-default p-2">
          <div v-for="row in processRows" :key="row.key" class="text-xs">
            <p>
              <span class="font-medium">{{ row.title }}</span>
              <span class="text-muted"> · {{ row.status }}</span>
            </p>
            <p v-if="row.target" class="text-muted">对象：{{ row.target }}</p>
            <template v-if="row.resultCount != null">
              <p class="text-muted">结果：{{ row.resultCount }} 条</p>
              <p v-for="(item, i) in row.resultItems" :key="i" class="pl-3 text-muted">
                · {{ item.title }}<template v-if="item.kbName"> · {{ item.kbName }}</template>
              </p>
            </template>
            <template v-if="row.text">
              <p v-if="expandedText === row.key" class="mt-0.5 whitespace-pre-wrap text-muted">{{ row.text }}</p>
              <p v-else class="mt-0.5 whitespace-pre-wrap text-muted">{{ row.text.slice(0, TEXT_PREVIEW_LENGTH) }}</p>
              <UButton
                v-if="row.text.length > TEXT_PREVIEW_LENGTH"
                size="xs"
                variant="link"
                :p="0"
                @click="toggleText(row.key)"
              >
                {{ expandedText === row.key ? '收起全文' : '展开全文' }}
              </UButton>
            </template>
          </div>
        </div>
        <p v-else class="text-sm text-muted">暂无数据</p>
      </div>
    </div>
  </div>
</template>
