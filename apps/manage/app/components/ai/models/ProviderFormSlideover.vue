<script setup lang="ts">
/**
 * 新增/编辑供应商抽屉：API Key 只写不回显，编辑留空保留原密文。
 */
import {
  emptyProviderForm,
  toProviderForm,
  validateProviderForm,
  type ModelProvider,
  type ProviderFormValue,
} from '~/lib/schemas/model-provider'

const props = defineProps<{
  editing: ModelProvider | null
  saving?: boolean
  errorMessage?: string
}>()

const emit = defineEmits<{
  save: [value: ProviderFormValue]
}>()

const open = defineModel<boolean>('open', { default: false })

const form = reactive<ProviderFormValue>(emptyProviderForm())
const validationError = ref('')
const showApiKey = ref(false)

watch([open, () => props.editing], ([isOpen]) => {
  if (!isOpen) return
  Object.assign(form, props.editing ? toProviderForm(props.editing) : emptyProviderForm())
  validationError.value = ''
  showApiKey.value = false
})

const creating = computed(() => props.editing === null)
const title = computed(() => (creating.value ? '新增模型供应商' : `编辑供应商 · ${props.editing?.displayName ?? ''}`))

function submit() {
  validationError.value = validateProviderForm(form, creating.value) ?? ''
  if (validationError.value) return
  emit('save', { ...form })
}
</script>

<template>
  <USlideover v-model:open="open" :title="title">
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="validationError || errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="validationError || errorMessage"
        />

        <UFormField label="供应商标识" required>
          <UInput
            v-model="form.providerKey"
            class="w-full"
            placeholder="例如 volcengine"
            :disabled="!creating"
          />
          <template v-if="!creating" #help>
            标识创建后不可修改
          </template>
        </UFormField>

        <UFormField label="展示名称" required>
          <UInput v-model="form.displayName" class="w-full" placeholder="例如 火山引擎" />
        </UFormField>

        <UFormField label="Base URL" required>
          <UInput v-model="form.baseUrl" class="w-full" placeholder="https://api.example.com/v1" />
        </UFormField>

        <UFormField :label="creating ? 'API Key' : 'API Key（留空则保留现有加密凭据）'" :required="creating">
          <UInput
            v-model="form.apiKey"
            class="w-full"
            :type="showApiKey ? 'text' : 'password'"
            autocomplete="off"
            placeholder="sk-..."
          >
            <template #trailing>
              <UButton
                size="xs"
                variant="ghost"
                :icon="showApiKey ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                @click="showApiKey = !showApiKey"
              />
            </template>
          </UInput>
        </UFormField>

        <UFormField label="模型列表（逗号分隔，自动去重）" required>
          <UTextarea
            v-model="form.models"
            class="w-full"
            :rows="3"
            placeholder="doubao-pro-32k, doubao-vision-pro"
          />
        </UFormField>

        <UFormField label="思考截断字数（500–200000）" required>
          <UInput v-model="form.processReasoningMaxChars" class="w-full" inputmode="numeric" />
        </UFormField>

        <div class="flex items-center justify-between">
          <span class="text-sm text-default">允许数据出境</span>
          <USwitch v-model="form.dataEgressAllowed" />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-sm text-default">启用该供应商</span>
          <USwitch v-model="form.enabled" />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="outline" color="neutral" @click="open = false">
          取消
        </UButton>
        <UButton :loading="saving" @click="submit">
          保存
        </UButton>
      </div>
    </template>
  </USlideover>
</template>
