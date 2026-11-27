<script setup lang="ts">
/** Trace 瀑布图：按事件 span 时间渲染横向条，颜色区分事件类型 */
import type { TraceTimeline } from '~/lib/trace/buildTraceTimeline'

const props = defineProps<{ timeline: TraceTimeline }>()

function barColor(type: string) {
  if (type === 'trace.model') return 'bg-primary'
  if (type === 'trace.action') return 'bg-warning'
  if (type === 'trace.verify') return 'bg-success'
  if (type === 'trace.context') return 'bg-info'
  return 'bg-neutral-400'
}

const bars = computed(() => props.timeline.bars.map((bar) => {
  const total = props.timeline.totalDurationMs || 1
  return {
    ...bar,
    left: Math.min((bar.offsetMs / total) * 100, 100),
    width: Math.max((bar.durationMs / total) * 100, 0.8),
    label: `${bar.event.type.replace('trace.', '')} · ${bar.durationMs.toFixed(0)}ms`,
  }
}))
</script>

<template>
  <div class="space-y-1">
    <div v-for="(bar, i) in bars" :key="i" class="flex items-center gap-2">
      <span class="w-28 shrink-0 truncate font-mono text-xs text-muted">{{ bar.event.type.replace('trace.', '') }}</span>
      <div class="relative h-4 flex-1 rounded bg-elevated">
        <UTooltip :text="bar.label">
          <div
            class="absolute top-0.5 h-3 rounded"
            :class="barColor(bar.event.type)"
            :style="{ left: `${bar.left}%`, width: `${bar.width}%` }"
          />
        </UTooltip>
      </div>
    </div>
    <p class="pt-1 text-right text-xs text-muted">总跨度 {{ (timeline.totalDurationMs / 1000).toFixed(2) }}s</p>
  </div>
</template>
