<script setup lang="ts">
/**
 * 逻辑模型配置卡：供应商-模型联动选择、推理格式/回传、向量维度、出境实时阻断。
 */
import {
  toLogicalForm,
  validateLogicalForm,
  type LogicalFormValue,
  type LogicalModelConfig,
  type ModelProvider,
} from '~/lib/schemas/model-provider'

const props = defineProps<{
  logicalName: 'agent_main' | 'fast' | 'embedding'
  title: string
  description: string
  vision?: boolean
  config?: LogicalModelConfig | null
  providers: ModelProvider[]
  saving?: boolean
  errorMessage?: string
}>()

const emit = defineEmits<{
  save: [value: LogicalFormValue]
}>()

const form = reactive<LogicalFormValue>(toLogicalForm(props.config))
const validationError = ref('')

watch(
  () => props.config,
  (config) => {
    Object.assign(form, toLogicalForm(config))
    validationError.value = ''
  },
)

const enabledProviders = computed(() => props.providers.filter((p) => p.enabled))

const providerOptions = computed(() =>
  enabledProviders.value.map((p) => ({ label: `${p.displayName}（${p.providerKey}）`, value: p.providerKey })),
)

const selectedProvider = computed(() =>
  props.providers.find((p) => p.providerKey === form.providerKey),
)

/** 供应商联动：列出登记模型供一键选取，同时允许手动输入未登记模型 */
const modelOptions = computed(() => {
  const models = selectedProvider.value?.models ?? []
  const options = models.map((m) => ({ label: m, value: m }))
  if (form.model && !models.includes(form.model)) {
    options.unshift({ label: `${form.model}（手动输入）`, value: form.model })
  }
  return options
})

const egressBlocked = computed(
  () => form.enabled && selectedProvider.value != null && !selectedProvider.value.dataEgressAllowed,
)

const reasoningFormatOptions = [
  { label: 'none（不解析推理）', value: 'none' },
  { label: 'reasoning_content', value: 'reasoning_content' },
  { label: 'reasoning', value: 'reasoning' },
  { label: 'think_tag', value: 'think_tag' },
]
const reasoningPassthroughOptions = [
  { label: 'none（不回传）', value: 'none' },
  { label: 'empty（空字段）', value: 'empty' },
  { label: 'original（原文）', value: 'original' },
]

function submit() {
  validationError.value = validateLogicalForm(form, props.logicalName, props.providers) ?? ''
  if (validationError.value) return
  emit('save', { ...form })
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-2">
        <div>
          <h3 class="font-medium text-default">{{ title }}</h3>
          <p class="mt-1 text-xs text-muted">{{ description }}</p>
        </div>
        <USwitch v-model="form.enabled" />
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        v-if="props.logicalName === 'embedding'"
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="修改向量模型或维度后，需在索引 Worker 执行 rebuild 重建物理索引方可生效"
      />
      <UAlert
        v-if="egressBlocked"
        color="error"
        variant="subtle"
        icon="i-lucide-shield-alert"
        title="当前供应商禁止数据出境，不能启用该逻辑模型"
      />
      <UAlert
        v-else-if="validationError || errorMessage"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="validationError || errorMessage"
      />

      <UFormField label="模型供应商">
        <USelect
          v-model="form.providerKey"
          :items="providerOptions"
          value-key="value"
          class="w-full"
          placeholder="选择供应商"
        />
      </UFormField>

      <UFormField label="模型">
        <USelectMenu
          v-model="form.model"
          :items="modelOptions"
          value-key="value"
          class="w-full"
          placeholder="选择或输入模型标识"
          create-item
          @create="(value: string) => { form.model = value }"
        />
      </UFormField>

      <UFormField v-if="props.logicalName === 'embedding'" label="向量维度（1–2048，留空自动探测）">
        <UInput v-model="form.dimensions" class="w-full" inputmode="numeric" placeholder="留空自动探测" />
      </UFormField>

      <template v-if="props.logicalName !== 'embedding'">
        <UFormField label="推理输出格式">
          <USelect v-model="form.reasoningFormat" :items="reasoningFormatOptions" value-key="value" class="w-full" />
        </UFormField>
        <UFormField label="推理回传方式">
          <USelect v-model="form.reasoningPassthrough" :items="reasoningPassthroughOptions" value-key="value" class="w-full" />
        </UFormField>
      </template>

      <div v-if="props.vision" class="flex items-center justify-between">
        <span class="text-sm text-default">支持页面图像输入（supportsVision）</span>
        <USwitch v-model="form.supportsVision" />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <!-- 配置未加载成功时禁止保存：后端保存是整体覆盖，空表单会抹掉现有配置 -->
        <UButton size="sm" :loading="saving" :disabled="egressBlocked || props.config == null" @click="submit">
          保存配置
        </UButton>
      </div>
    </template>
  </UCard>
</template>
