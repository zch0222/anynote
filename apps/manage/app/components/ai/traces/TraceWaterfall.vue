<script setup lang="ts">
/**
 * Trace 瀑布图：按事件 span 时间渲染横向条，颜色区分事件类型与模型阶段；
 * 模型调用拆为首字前等待与流式生成两段，每次工具调用各占一条。
 */
import type { TimelineBar, TraceTimeline } from '~/lib/trace/buildTraceTimeline'

const props = defineProps<{ timeline: TraceTimeline }>()

function barColor(bar: TimelineBar) {
  if (bar.kind === 'model-first-output') return 'bg-primary/40'
  if (bar.kind === 'model-generation') return 'bg-primary'
  if (bar.kind === 'tool') return 'bg-warning'
  const type = bar.event.type
  if (type === 'trace.model') return 'bg-primary'
  if (type === 'trace.verify') return 'bg-success'
  if (type === 'trace.context') return 'bg-info'
  return 'bg-neutral-400'
}

const bars = computed(() => props.timeline.bars.map((bar) => {
  const total = props.timeline.totalDurationMs || 1
  return {
    ...bar,
    color: barColor(bar),
    left: Math.min((bar.offsetMs / total) * 100, 100),
    width: Math.max((bar.durationMs / total) * 100, 0.8),
    tooltip: `${bar.label} · ${bar.durationMs.toFixed(0)}ms`,
  }
}))
</script>

<template>
  <div class="space-y-1">
    <div v-for="(bar, i) in bars" :key="i" class="flex items-center gap-2">
      <span class="w-36 shrink-0 truncate font-mono text-xs text-muted">{{ bar.label }}</span>
      <div class="relative h-4 flex-1 rounded bg-elevated">
        <UTooltip :text="bar.tooltip">
          <div
            class="absolute top-0.5 h-3 rounded"
            :class="bar.color"
            :style="{ left: `${bar.left}%`, width: `${bar.width}%` }"
          />
        </UTooltip>
      </div>
    </div>
    <p class="pt-1 text-right text-xs text-muted">总跨度 {{ (timeline.totalDurationMs / 1000).toFixed(2) }}s</p>
  </div>
</template>
