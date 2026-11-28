<script setup lang="ts">
/**
 * 用户管理页：用户名搜索、分页列表、重置密码、设置/取消超管、停用/启用账号。
 */
import QueryErrorState from '~/components/shared/QueryErrorState.vue'
import UserTable from '~/components/system/users/UserTable.vue'
import {
  useBanUser,
  useManageUsers,
  useResetUserPassword,
  useUnbanUser,
  useUpdateSuperAdmin,
} from '~/composables/system/useManageUsers'
import { useAdminSession } from '~/composables/auth/useAdminSession'
import {
  validateResetPasswordForm,
  type ManageUser,
} from '~/lib/schemas/manage-user'

const toast = useToast()
const session = useAdminSession()

const currentUserId = computed(() => session.profile.value?.id ?? null)

const username = ref('')
const appliedUsername = ref('')
const page = ref(1)
const pageSize = 20

const queryParams = computed(() => ({
  pageNum: page.value,
  pageSize,
  username: appliedUsername.value,
}))
const usersQuery = useManageUsers(queryParams)
const records = computed(() => usersQuery.data.value?.rows ?? [])
const total = computed(() => usersQuery.data.value?.total ?? 0)

const resetPassword = useResetUserPassword()
const updateSuperAdmin = useUpdateSuperAdmin()
const banUser = useBanUser()
const unbanUser = useUnbanUser()

function applyFilters() {
  page.value = 1
  appliedUsername.value = username.value.trim()
}

function onPageChange(next: number) {
  page.value = next
}

const resetTarget = ref<ManageUser | null>(null)
const resetForm = reactive({ newPassword: '', confirmPassword: '' })
const resetError = ref('')

function openResetPassword(user: ManageUser) {
  resetTarget.value = user
  resetForm.newPassword = ''
  resetForm.confirmPassword = ''
  resetError.value = ''
}

async function submitResetPassword() {
  if (!resetTarget.value) return
  const error = validateResetPasswordForm({ ...resetForm })
  if (error) {
    resetError.value = error
    return
  }
  resetError.value = ''
  try {
    await resetPassword.mutateAsync({
      userId: resetTarget.value.userId,
      newPassword: resetForm.newPassword,
    })
    resetTarget.value = null
    toast.add({ title: '密码已重置', color: 'success' })
  } catch (error) {
    resetError.value = (error as Error).message || '重置密码失败，请稍后重试'
  }
}

const adminTarget = ref<ManageUser | null>(null)
const adminEnabled = ref(true)
const adminError = ref('')

const adminTitle = computed(() => (adminEnabled.value ? '设为超级管理员' : '取消超级管理员'))
const adminDescription = computed(() => {
  if (!adminTarget.value) return ''
  return adminEnabled.value
    ? `确定要将 ${adminTarget.value.username} 设为超级管理员吗？该账号将获得管理后台的全部权限。`
    : `确定要取消 ${adminTarget.value.username} 的超级管理员身份吗？该账号将变为普通成员，并失去管理后台权限。`
})

function openSuperAdmin(user: ManageUser, enabled: boolean) {
  adminTarget.value = user
  adminEnabled.value = enabled
  adminError.value = ''
}

async function submitSuperAdmin() {
  if (!adminTarget.value) return
  adminError.value = ''
  try {
    await updateSuperAdmin.mutateAsync({
      userId: adminTarget.value.userId,
      enabled: adminEnabled.value,
    })
    toast.add({
      title: adminEnabled.value ? '已设为超级管理员' : '已取消超级管理员',
      color: 'success',
    })
    adminTarget.value = null
  } catch (error) {
    adminError.value = (error as Error).message
      || (adminEnabled.value ? '设置超级管理员失败，请稍后重试' : '取消超级管理员失败，请稍后重试')
  }
}

const statusTarget = ref<ManageUser | null>(null)
const statusEnabled = ref(false)
const statusError = ref('')

const statusTitle = computed(() => (statusEnabled.value ? '启用账号' : '停用账号'))
const statusDescription = computed(() => {
  if (!statusTarget.value) return ''
  return statusEnabled.value
    ? `确定要启用 ${statusTarget.value.username} 的账号吗？启用后该用户可以重新登录。`
    : `确定要停用 ${statusTarget.value.username} 的账号吗？停用后该用户将无法登录，现有登录会话会立即失效。`
})

function openStatus(user: ManageUser, enabled: boolean) {
  statusTarget.value = user
  statusEnabled.value = enabled
  statusError.value = ''
}

async function submitStatus() {
  if (!statusTarget.value) return
  statusError.value = ''
  try {
    if (statusEnabled.value) {
      await unbanUser.mutateAsync(statusTarget.value.userId)
    } else {
      await banUser.mutateAsync(statusTarget.value.userId)
    }
    toast.add({
      title: statusEnabled.value ? '账号已启用' : '账号已停用',
      color: 'success',
    })
    statusTarget.value = null
  } catch (error) {
    statusError.value = (error as Error).message
      || (statusEnabled.value ? '启用账号失败，请稍后重试' : '停用账号失败，请稍后重试')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-end gap-3">
      <h2 class="mr-auto text-base font-medium text-default">
        用户管理
      </h2>
      <UInput
        v-model="username"
        placeholder="搜索用户名"
        class="w-56"
        @keydown.enter="applyFilters"
      />
      <UButton icon="i-lucide-search" :loading="usersQuery.isFetching.value" @click="applyFilters">
        查询
      </UButton>
    </div>

    <QueryErrorState v-if="usersQuery.isError.value" @retry="usersQuery.refetch()" />

    <UCard v-else :ui="{ body: 'p-0' }">
      <UserTable
        :users="records"
        :loading="usersQuery.isPending.value"
        :current-user-id="currentUserId"
        @reset-password="openResetPassword"
        @toggle-super-admin="openSuperAdmin"
        @toggle-status="openStatus"
      />
      <div v-if="total > pageSize" class="flex justify-end border-t border-default px-4 py-2">
        <UPagination
          v-model:page="page"
          :total="total"
          :items-per-page="pageSize"
          size="sm"
          @update:page="onPageChange"
        />
      </div>
    </UCard>

    <UModal
      :open="resetTarget != null"
      title="重置密码"
      @update:open="!$event && (resetTarget = null)"
    >
      <template #content>
        <div class="space-y-4 p-6">
          <p class="text-sm text-muted">
            {{ resetTarget ? `为 ${resetTarget.username} 设置新密码。重置后该用户的所有登录会话将立即失效。` : '' }}
          </p>
          <UAlert
            v-if="resetError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="resetError"
          />
          <UFormField label="新密码" required>
            <UInput
              v-model="resetForm.newPassword"
              class="w-full"
              type="password"
              autocomplete="new-password"
              placeholder="8-15 位，需包含大写字母、小写字母和数字，可含特殊字符（不含空格）"
            />
          </UFormField>
          <UFormField label="确认新密码" required>
            <UInput
              v-model="resetForm.confirmPassword"
              class="w-full"
              type="password"
              autocomplete="new-password"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="outline" color="neutral" @click="resetTarget = null">
              取消
            </UButton>
            <UButton :loading="resetPassword.isPending.value" @click="submitResetPassword">
              确认重置
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="adminTarget != null"
      :title="adminTitle"
      @update:open="!$event && (adminTarget = null)"
    >
      <template #content>
        <div class="space-y-4 p-6">
          <p class="text-sm text-muted">
            {{ adminDescription }}
          </p>
          <UAlert
            v-if="adminError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="adminError"
          />
          <div class="flex justify-end gap-2">
            <UButton variant="outline" color="neutral" @click="adminTarget = null">
              取消
            </UButton>
            <UButton :loading="updateSuperAdmin.isPending.value" @click="submitSuperAdmin">
              {{ adminEnabled ? '确认设置' : '确认取消' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal
      :open="statusTarget != null"
      :title="statusTitle"
      @update:open="!$event && (statusTarget = null)"
    >
      <template #content>
        <div class="space-y-4 p-6">
          <p class="text-sm text-muted">
            {{ statusDescription }}
          </p>
          <UAlert
            v-if="statusError"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="statusError"
          />
          <div class="flex justify-end gap-2">
            <UButton variant="outline" color="neutral" @click="statusTarget = null">
              取消
            </UButton>
            <UButton
              :color="statusEnabled ? 'primary' : 'error'"
              :loading="banUser.isPending.value || unbanUser.isPending.value"
              @click="submitStatus"
            >
              {{ statusEnabled ? '确认启用' : '确认停用' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
