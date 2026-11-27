<script setup lang="ts">
/**
 * 模型供应商目录 CRUD + 三大逻辑模型运行时绑定页。
 */
import LogicalModelCard from '~/components/ai/models/LogicalModelCard.vue'
import ProviderFormSlideover from '~/components/ai/models/ProviderFormSlideover.vue'
import ProviderTable from '~/components/ai/models/ProviderTable.vue'
import QueryErrorState from '~/components/shared/QueryErrorState.vue'
import { useDeleteProvider, useModelProviders, useSaveProvider } from '~/composables/ai/useModelProviders'
import { useLogicalModels, useSaveLogicalModel } from '~/composables/ai/useLogicalModels'
import {
  buildDeleteProviderMessage,
  findLogicalReferencers,
  LOGICAL_MODEL_CARDS,
  type LogicalFormValue,
  type ModelProvider,
  type ProviderFormValue,
} from '~/lib/schemas/model-provider'

const toast = useToast()

const providersQuery = useModelProviders()
const logicalQuery = useLogicalModels()
const saveProvider = useSaveProvider()
const deleteProvider = useDeleteProvider()
const saveLogical = useSaveLogicalModel()

const slideoverOpen = ref(false)
const editingProvider = ref<ModelProvider | null>(null)
const saveError = ref('')

const deleteTarget = ref<ModelProvider | null>(null)
const deleteError = ref('')

const providers = computed(() => providersQuery.data.value ?? [])
const logicalConfigs = computed(() => logicalQuery.data.value ?? {})

const deleteMessage = computed(() => {
  if (!deleteTarget.value) return ''
  const referencers = findLogicalReferencers(
    deleteTarget.value.providerKey,
    LOGICAL_MODEL_CARDS.map((card) => logicalConfigs.value[card.logicalName]),
  )
  return buildDeleteProviderMessage(deleteTarget.value.displayName, referencers)
})

function openCreate() {
  editingProvider.value = null
  saveError.value = ''
  slideoverOpen.value = true
}

function openEdit(provider: ModelProvider) {
  editingProvider.value = provider
  saveError.value = ''
  slideoverOpen.value = true
}

async function onSaveProvider(value: ProviderFormValue) {
  saveError.value = ''
  try {
    await saveProvider.mutateAsync({ value, editing: editingProvider.value?.providerKey ?? null })
    slideoverOpen.value = false
    toast.add({ title: '供应商已保存', color: 'success' })
  } catch (error) {
    saveError.value = (error as Error).message || '请求失败，请稍后重试'
  }
}

function confirmDelete(provider: ModelProvider) {
  deleteTarget.value = provider
  deleteError.value = ''
}

async function onDeleteProvider() {
  if (!deleteTarget.value) return
  deleteError.value = ''
  try {
    await deleteProvider.mutateAsync(deleteTarget.value.providerKey)
    deleteTarget.value = null
    toast.add({ title: '供应商已删除', color: 'success' })
  } catch (error) {
    deleteError.value = (error as Error).message || '请求失败，请稍后重试'
  }
}

const logicalSaveErrors = reactive<Record<string, string>>({})

async function onSaveLogical(logicalName: string, value: LogicalFormValue) {
  logicalSaveErrors[logicalName] = ''
  try {
    await saveLogical.mutateAsync({ logicalName, value })
    toast.add({ title: '逻辑模型配置已保存', color: 'success' })
  } catch (error) {
    logicalSaveErrors[logicalName] = (error as Error).message || '请求失败，请稍后重试'
  }
}
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-medium text-default">
          模型供应商目录
        </h2>
        <UButton size="sm" icon="i-lucide-plus" @click="openCreate">
          新增供应商
        </UButton>
      </div>
      <QueryErrorState
        v-if="providersQuery.isError.value"
        @retry="providersQuery.refetch()"
      />
      <ProviderTable
        v-else
        :providers="providers"
        :loading="providersQuery.isLoading.value"
        @edit="openEdit"
        @delete="confirmDelete"
      />
    </section>

    <section class="space-y-3">
      <h2 class="text-base font-medium text-default">
        运行时逻辑模型绑定
      </h2>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <LogicalModelCard
          v-for="card in LOGICAL_MODEL_CARDS"
          :key="card.logicalName"
          :logical-name="card.logicalName"
          :title="card.title"
          :description="card.description"
          :vision="card.vision"
          :config="logicalConfigs[card.logicalName]"
          :providers="providers"
          :saving="saveLogical.isPending.value"
          :error-message="logicalSaveErrors[card.logicalName]"
          @save="(value) => onSaveLogical(card.logicalName, value)"
        />
      </div>
    </section>

    <ProviderFormSlideover
      v-model:open="slideoverOpen"
      :editing="editingProvider"
      :saving="saveProvider.isPending.value"
      :error-message="saveError"
      @save="onSaveProvider"
    />

    <UModal :open="deleteTarget != null" title="删除供应商" @update:open="!$event && (deleteTarget = null)">
      <template #content>
        <div class="space-y-4 p-6">
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="deleteMessage"
          />
          <UAlert
            v-if="deleteError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="deleteError"
          />
          <div class="flex justify-end gap-2">
            <UButton variant="outline" color="neutral" @click="deleteTarget = null">
              取消
            </UButton>
            <UButton color="error" :loading="deleteProvider.isPending.value" @click="onDeleteProvider">
              确认删除
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
