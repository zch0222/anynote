<script setup lang="ts">
/**
 * 知识检索 24 项参数配置页：五分组卡片、默认值差异徽章、单字段还原、
 * 重置全部为推荐默认值、未保存修改离开守卫。
 */
import { onBeforeRouteLeave } from 'vue-router'
import QueryErrorState from '~/components/shared/QueryErrorState.vue'
import { useRetrievalSettings, useSaveRetrievalSettings } from '~/composables/ai/useRetrievalSettings'
import {
  defaultRetrievalValues,
  diffFromDefaults,
  toRetrievalValues,
  validateRetrievalValues,
  RETRIEVAL_GROUPS,
  type RetrievalValues,
} from '~/lib/schemas/retrieval-setting'

const toast = useToast()
const settingsQuery = useRetrievalSettings()
const saveSettings = useSaveRetrievalSettings()

const form = reactive<RetrievalValues>(defaultRetrievalValues())
const validationError = ref('')
const resetNotice = ref(false)
const dirty = ref(false)

watch(
  () => settingsQuery.data.value,
  (vo) => {
    if (vo) {
      Object.assign(form, toRetrievalValues(vo))
      dirty.value = false
      resetNotice.value = false
    }
  },
  { immediate: true },
)

const version = computed(() => settingsQuery.data.value?.version ?? 0)
const updateTime = computed(() => settingsQuery.data.value?.updateTime)
const diffKeys = computed(() => diffFromDefaults(form))

function markDirty() {
  dirty.value = true
  validationError.value = ''
}

function resetField(key: string, defaultValue: number) {
  ;(form as Record<string, number | boolean>)[key] = defaultValue
  markDirty()
}

function resetAll() {
  Object.assign(form, defaultRetrievalValues())
  dirty.value = true
  resetNotice.value = true
  validationError.value = ''
}

async function save() {
  validationError.value = validateRetrievalValues(form) ?? ''
  if (validationError.value) return
  try {
    await saveSettings.mutateAsync({ ...form })
    dirty.value = false
    resetNotice.value = false
    toast.add({ title: '检索参数已保存', color: 'success' })
  } catch (error) {
    validationError.value = (error as Error).message || '请求失败，请稍后重试'
  }
}

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('当前页面有未保存的修改，确定离开吗？')) {
    return false
  }
})
</script>

<template>
  <div class="space-y-4 pb-20">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-base font-medium text-default">
          知识检索运行参数
        </h2>
        <p class="mt-1 text-xs text-muted">
          <template v-if="version === 0">当前使用系统内置默认参数，尚未落库修改</template>
          <template v-else>配置版本 v{{ version }}<template v-if="updateTime"> · 最近保存 {{ new Date(updateTime).toLocaleString() }}</template></template>
        </p>
      </div>
      <UButton size="sm" variant="outline" icon="i-lucide-rotate-ccw" @click="resetAll">
        重置全部为推荐默认值
      </UButton>
    </div>

    <QueryErrorState v-if="settingsQuery.isError.value" @retry="settingsQuery.refetch()" />

    <template v-else>
      <UAlert
        v-if="resetNotice"
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="已填入推荐默认值，保存后生效"
      />
      <UAlert
        v-if="validationError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="validationError"
      />

      <UCard v-for="group in RETRIEVAL_GROUPS" :key="group.id">
        <template #header>
          <div>
            <h3 class="font-medium text-default">{{ group.title }}</h3>
            <p v-if="group.description" class="mt-1 text-xs text-muted">{{ group.description }}</p>
          </div>
        </template>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div v-for="field in group.fields" :key="field.key" class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="text-sm text-default">{{ field.label }}</span>
              <UBadge v-if="diffKeys.has(field.key)" size="xs" variant="subtle" color="warning">
                已修改
              </UBadge>
            </div>
            <div class="flex items-center gap-2">
              <UInput
                :model-value="String((form as Record<string, number | boolean>)[field.key] ?? '')"
                class="w-full"
                inputmode="decimal"
                @update:model-value="(form as Record<string, number | boolean>)[field.key] = Number($event); markDirty()"
              />
              <UTooltip v-if="diffKeys.has(field.key)" :text="`还原默认 ${field.defaultValue}`">
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-undo-2"
                  @click="resetField(field.key, field.defaultValue)"
                />
              </UTooltip>
            </div>
            <p class="text-xs text-muted">
              {{ field.min }}–{{ field.max }} · 默认 {{ field.defaultValue }}
            </p>
          </div>
        </div>
        <div v-if="group.id === 'grep'" class="mt-4 flex items-center justify-between border-t border-default pt-4">
          <div class="flex items-center gap-2">
            <span class="text-sm text-default">启用重排（rerank）</span>
            <UBadge v-if="diffKeys.has('rerankEnabled')" size="xs" variant="subtle" color="warning">
              已修改
            </UBadge>
          </div>
          <USwitch
            :model-value="form.rerankEnabled"
            @update:model-value="form.rerankEnabled = $event; markDirty()"
          />
        </div>
      </UCard>

      <div class="sticky bottom-0 -mx-1 flex items-center justify-end gap-3 border-t border-default bg-default/95 px-1 py-3 backdrop-blur">
        <span v-if="dirty" class="text-xs text-warning">有未保存的修改</span>
        <UButton :loading="saveSettings.isPending.value" :disabled="!dirty" @click="save">
          保存变更（对新发起的运行立即生效）
        </UButton>
      </div>
    </template>
  </div>
</template>
