/**
 * 模型供应商 Query / Mutation：CRUD 经 BFF 代理，保存后精确失效列表缓存。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { unwrapEnvelope } from '@anynote/api-core'
import { aiClient } from '~/lib/api/client'
import { queryKeys } from '~/lib/api/query-keys'
import {
  modelProviderListSchema,
  parseProcessReasoningMaxChars,
  parseProviderModels,
  type ProviderFormValue,
} from '~/lib/schemas/model-provider'

export function useModelProviders() {
  return useQuery({
    queryKey: queryKeys.modelProviders(),
    queryFn: async ({ signal }) => {
      const { response } = await aiClient.GET('/v1/admin/model-providers', {
        parseAs: 'stream',
        signal,
      })
      return unwrapEnvelope(response, modelProviderListSchema.parse)
    },
  })
}

function formToBody(value: ProviderFormValue) {
  return {
    providerKey: value.providerKey.trim(),
    displayName: value.displayName.trim(),
    protocol: value.protocol,
    baseUrl: value.baseUrl.trim(),
    models: parseProviderModels(value.models),
    dataEgressAllowed: value.dataEgressAllowed,
    enabled: value.enabled,
    processReasoningMaxChars: parseProcessReasoningMaxChars(value.processReasoningMaxChars) ?? 0,
  }
}

/** 新增或编辑保存：editing 为 null 时走 POST 创建，否则 PUT 更新且 apiKey 留空不覆盖 */
export function useSaveProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ value, editing }: { value: ProviderFormValue; editing: string | null }) => {
      const body = formToBody(value)
      const apiKey = value.apiKey.trim()
      if (editing === null) {
        const { response } = await aiClient.POST('/v1/admin/model-providers', {
          body: { ...body, apiKey },
          parseAs: 'stream',
        })
        return unwrapEnvelope(response, (data) => data)
      }
      const { response } = await aiClient.PUT('/v1/admin/model-providers/{providerKey}', {
        params: { path: { providerKey: editing } },
        body: { ...body, ...(apiKey ? { apiKey } : {}) },
        parseAs: 'stream',
      })
      return unwrapEnvelope(response, (data) => data)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.modelProviders() }),
  })
}

export function useDeleteProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (providerKey: string) => {
      const { response } = await aiClient.DELETE('/v1/admin/model-providers/{providerKey}', {
        params: { path: { providerKey } },
        parseAs: 'stream',
      })
      return unwrapEnvelope(response, (data) => data)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.modelProviders() }),
  })
}
