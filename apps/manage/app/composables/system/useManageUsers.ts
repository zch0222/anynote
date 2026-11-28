/**
 * 管理端用户 Query / Mutation：列表查询与重置密码、超管、停用/启用操作。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { unwrapEnvelope } from '@anynote/api-core'
import { manageClient } from '~/lib/api/client'
import { queryKeys } from '~/lib/api/query-keys'
import { manageUserPageSchema } from '~/lib/schemas/manage-user'

export interface ManageUserFilters {
  pageNum: number
  pageSize: number
  username: string
}

export function useManageUsers(filters: MaybeRefOrGetter<ManageUserFilters>) {
  return useQuery({
    queryKey: computed(() => queryKeys.manageUsers(toValue(filters) as unknown as Record<string, unknown>)),
    queryFn: async ({ signal }) => {
      const f = toValue(filters)
      const { response } = await manageClient.GET('/v1/admin/users', {
        params: {
          query: {
            pageNum: f.pageNum,
            pageSize: f.pageSize,
            username: f.username || undefined,
          },
        },
        parseAs: 'stream',
        signal,
      })
      return unwrapEnvelope(response, manageUserPageSchema.parse)
    },
  })
}

/** 用户写操作成功后失效列表缓存 */
function useInvalidateManageUsers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['manage-users'] })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number, newPassword: string }) => {
      const { response } = await manageClient.PUT('/v1/admin/users/{userId}/password', {
        params: { path: { userId } },
        body: { newPassword },
        parseAs: 'stream',
      })
      return unwrapEnvelope(response, (data) => data)
    },
  })
}

export function useUpdateSuperAdmin() {
  const invalidate = useInvalidateManageUsers()
  return useMutation({
    mutationFn: async ({ userId, enabled }: { userId: number, enabled: boolean }) => {
      const { response } = await manageClient.PUT('/v1/admin/users/{userId}/super-admin', {
        params: { path: { userId } },
        body: { enabled },
        parseAs: 'stream',
      })
      return unwrapEnvelope(response, (data) => data)
    },
    onSuccess: invalidate,
  })
}

export function useBanUser() {
  const invalidate = useInvalidateManageUsers()
  return useMutation({
    mutationFn: async (userId: number) => {
      const { response } = await manageClient.POST('/v1/admin/users/{userId}/ban', {
        params: { path: { userId } },
        parseAs: 'stream',
      })
      return unwrapEnvelope(response, (data) => data)
    },
    onSuccess: invalidate,
  })
}

export function useUnbanUser() {
  const invalidate = useInvalidateManageUsers()
  return useMutation({
    mutationFn: async (userId: number) => {
      const { response } = await manageClient.POST('/v1/admin/users/{userId}/unban', {
        params: { path: { userId } },
        parseAs: 'stream',
      })
      return unwrapEnvelope(response, (data) => data)
    },
    onSuccess: invalidate,
  })
}
