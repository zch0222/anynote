<script setup lang="ts">
/** 分轮导航：按模型轮次折叠展示每轮事件，点击切换检查器选中事件 */
import type { TraceRound } from '~/lib/trace/buildTraceTimeline'
import type { ParsedTraceEvent } from '~/lib/schemas/agent-trace'

defineProps<{ rounds: TraceRound[], selectedSeq?: number }>()
const emit = defineEmits<{ select: [event: ParsedTraceEvent] }>()
const open = ref<Record<number, boolean>>({ 1: true })

function eventLabel(type: string) {
  return type.replace('trace.', '')
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="round in rounds" :key="round.turn" class="rounded border border-default">
      <button
        type="button"
        class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-elevated/50"
        @click="open[round.turn] = !open[round.turn]"
      >
        <span class="font-medium text-default">
          {{ round.turn === 0 ? '前置阶段' : `第 ${round.turn} 轮` }}
        </span>
        <span class="flex items-center gap-2 text-xs text-muted">
          <span v-if="round.usage?.totalTokens != null">{{ round.usage.totalTokens }} tok</span>
          <span v-if="round.toolCalls">{{ round.toolCalls }} 次工具</span>
          <UBadge v-if="round.verifyPassed === false" color="error" variant="subtle" size="xs">校验未过</UBadge>
          <UIcon :name="open[round.turn] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
        </span>
      </button>
      <div v-if="open[round.turn]" class="border-t border-default">
        <button
          v-for="event in round.events"
          :key="event.seq"
          type="button"
          class="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-elevated/50"
          :class="{ 'bg-primary/10': selectedSeq === event.seq }"
          @click="emit('select', event)"
        >
          <span class="font-mono">{{ eventLabel(event.type) }}</span>
          <span class="text-muted">seq {{ event.seq }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
