/**
 * 检索参数 Query / Mutation：单行配置读取与整体保存。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { unwrapEnvelope } from '@anynote/api-core'
import { aiClient } from '~/lib/api/client'
import { queryKeys } from '~/lib/api/query-keys'
import {
  retrievalSettingVoSchema,
  toRetrievalUpdateBody,
  type RetrievalValues,
} from '~/lib/schemas/retrieval-setting'

export function useRetrievalSettings() {
  return useQuery({
    queryKey: queryKeys.retrievalSettings(),
    queryFn: async ({ signal }) => {
      const { response } = await aiClient.GET('/v1/admin/retrieval-settings', {
        parseAs: 'stream',
        signal,
      })
      return unwrapEnvelope(response, retrievalSettingVoSchema.parse)
    },
  })
}

export function useSaveRetrievalSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: RetrievalValues) => {
      const { response } = await aiClient.PUT('/v1/admin/retrieval-settings', {
        body: toRetrievalUpdateBody(values) as never,
        parseAs: 'stream',
      })
      return unwrapEnvelope(response, retrievalSettingVoSchema.parse)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.retrievalSettings() }),
  })
}
