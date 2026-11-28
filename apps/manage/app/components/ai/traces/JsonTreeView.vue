<script setup lang="ts">
/** 只读 JSON 树视图：递归折叠展示任意 JSON 值 */
const props = defineProps<{ value: unknown, depth?: number }>()
const depth = computed(() => props.depth ?? 0)
const collapsed = ref(depth.value >= 2)

const kind = computed(() => {
  const v = props.value
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
})
const bracketLabel = computed(() =>
  kind.value === 'array' ? `[${(props.value as unknown[]).length}]` : `{${Object.keys(props.value as object).length}}`,
)
const entries = computed(() => {
  if (kind.value === 'array') return (props.value as unknown[]).map((v, i) => [String(i), v] as const)
  if (kind.value === 'object') return Object.entries(props.value as Record<string, unknown>)
  return []
})
</script>

<template>
  <div :style="{ paddingLeft: depth ? '14px' : '0' }" class="font-mono text-xs">
    <template v-if="kind === 'object' || kind === 'array'">
      <button type="button" class="cursor-pointer text-muted hover:text-default" @click="collapsed = !collapsed">
        {{ collapsed ? '▸' : '▾' }} {{ bracketLabel }}
      </button>
      <div v-if="!collapsed">
        <div v-for="[k, v] in entries" :key="k">
          <span class="text-primary">{{ k }}</span>:
          <JsonTreeView :value="v" :depth="depth + 1" class="inline-block align-top" />
        </div>
      </div>
    </template>
    <span v-else-if="kind === 'string'" class="text-success">"{{ value }}"</span>
    <span v-else class="text-warning">{{ String(value) }}</span>
  </div>
</template>
