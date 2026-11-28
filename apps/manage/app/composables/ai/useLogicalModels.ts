/**
 * 逻辑模型配置 Query / Mutation：三张卡片一次性拉取，按卡片保存。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { unwrapEnvelope } from '@anynote/api-core'
import { aiClient } from '~/lib/api/client'
import { queryKeys } from '~/lib/api/query-keys'
import {
  logicalModelConfigSchema,
  parseEmbeddingDimensions,
  LOGICAL_MODEL_CARDS,
  type LogicalFormValue,
} from '~/lib/schemas/model-provider'

export type LogicalName = (typeof LOGICAL_MODEL_CARDS)[number]['logicalName']

/** 一次性并发拉取三个逻辑模型配置，返回 logicalName -> config 映射 */
export function useLogicalModels() {
  return useQuery({
    queryKey: queryKeys.logicalModel('all'),
    queryFn: async ({ signal }) => {
      const entries = await Promise.all(
        LOGICAL_MODEL_CARDS.map(async (card) => {
          const { response } = await aiClient.GET('/v1/admin/model-providers/logical/{logicalName}', {
            params: { path: { logicalName: card.logicalName } },
            parseAs: 'stream',
            signal,
          })
          const config = await unwrapEnvelope(response, logicalModelConfigSchema.parse)
          return [card.logicalName, config] as const
        }),
      )
      return Object.fromEntries(entries) as Record<string, ReturnType<typeof logicalModelConfigSchema.parse>>
    },
  })
}

/** 保存单个逻辑模型配置：留空维度不传（自动探测），出境阻断由表单层先行拦截 */
export function useSaveLogicalModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ logicalName, value }: { logicalName: string; value: LogicalFormValue }) => {
      const dims = parseEmbeddingDimensions(value.dimensions)
      const { response } = await aiClient.PUT('/v1/admin/model-providers/logical/{logicalName}', {
        params: { path: { logicalName } },
        body: {
          enabled: value.enabled,
          providerKey: value.providerKey.trim() || undefined,
          model: value.model.trim() || undefined,
          ...(logicalName === 'embedding' && dims.ok && dims.value != null
            ? { dimensions: dims.value }
            : {}),
          reasoningFormat: value.reasoningFormat,
          reasoningPassthrough: value.reasoningPassthrough,
          supportsVision: value.supportsVision,
        },
        parseAs: 'stream',
      })
      return unwrapEnvelope(response, logicalModelConfigSchema.parse)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.logicalModel('all') }),
  })
}
