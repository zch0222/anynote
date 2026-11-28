<script setup lang="ts">
/**
 * 管理端用户表格：展示账号、角色、状态、联系方式与操作。
 */
import {
  canResetPassword,
  canToggleStatus,
  canToggleSuperAdmin,
  isCurrentUser,
  roleColor,
  roleLabel,
  userStatusColor,
  userStatusLabel,
  type ManageUser,
} from '~/lib/schemas/manage-user'

const props = defineProps<{
  users: ManageUser[]
  loading?: boolean
  currentUserId?: number | null
}>()

const emit = defineEmits<{
  resetPassword: [user: ManageUser]
  toggleSuperAdmin: [user: ManageUser, enabled: boolean]
  toggleStatus: [user: ManageUser, enabled: boolean]
}>()

const columns = [
  { accessorKey: 'username', header: '用户' },
  { accessorKey: 'roleKey', header: '角色' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'email', header: '邮箱' },
  { accessorKey: 'phoneNumber', header: '手机号' },
  { accessorKey: 'createTime', header: '注册时间' },
  { accessorKey: 'loginDate', header: '最后登录' },
  { id: 'actions', header: '操作' },
]

/**
 * 格式化时间
 *
 * @param input ISO 时间
 * @return 本地时间文案
 */
function formatTime(input?: string | null) {
  if (!input) return '—'
  return new Date(input).toLocaleString()
}

void props
</script>

<template>
  <UTable :columns="columns" :data="users" :loading="loading">
    <template #username-cell="{ row }">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <p class="truncate font-medium text-default">
            {{ row.original.username }}
          </p>
          <UBadge
            v-if="isCurrentUser(row.original.userId, currentUserId)"
            size="xs"
            variant="subtle"
            color="info"
          >
            当前账号
          </UBadge>
        </div>
        <p class="truncate text-xs text-muted">
          {{ row.original.nickname || '—' }}
        </p>
      </div>
    </template>
    <template #roleKey-cell="{ row }">
      <UBadge size="sm" variant="subtle" :color="roleColor(row.original.roleKey)">
        {{ roleLabel(row.original.roleKey) }}
      </UBadge>
    </template>
    <template #status-cell="{ row }">
      <UBadge size="sm" variant="subtle" :color="userStatusColor(row.original.status)">
        {{ userStatusLabel(row.original.status) }}
      </UBadge>
    </template>
    <template #email-cell="{ row }">
      <span class="text-xs text-muted">{{ row.original.email || '—' }}</span>
    </template>
    <template #phoneNumber-cell="{ row }">
      <span class="text-xs text-muted">{{ row.original.phoneNumber || '—' }}</span>
    </template>
    <template #createTime-cell="{ row }">
      <span class="text-xs text-muted">{{ formatTime(row.original.createTime) }}</span>
    </template>
    <template #loginDate-cell="{ row }">
      <span class="text-xs text-muted">{{ formatTime(row.original.loginDate) }}</span>
    </template>
    <template #actions-cell="{ row }">
      <div class="flex gap-1">
        <UButton
          size="xs"
          variant="ghost"
          icon="i-lucide-key-round"
          aria-label="重置密码"
          :disabled="!canResetPassword(row.original, currentUserId)"
          @click="emit('resetPassword', row.original)"
        />
        <UButton
          size="xs"
          variant="ghost"
          :icon="row.original.roleKey === 'ADMIN_X' ? 'i-lucide-shield-minus' : 'i-lucide-shield-plus'"
          :aria-label="row.original.roleKey === 'ADMIN_X' ? '取消超级管理员' : '设为超级管理员'"
          :disabled="!canToggleSuperAdmin(row.original, currentUserId)"
          @click="emit('toggleSuperAdmin', row.original, row.original.roleKey !== 'ADMIN_X')"
        />
        <UButton
          size="xs"
          variant="ghost"
          :color="row.original.status === 1 ? 'success' : 'error'"
          :icon="row.original.status === 1 ? 'i-lucide-circle-check' : 'i-lucide-ban'"
          :aria-label="row.original.status === 1 ? '启用账号' : '停用账号'"
          :disabled="!canToggleStatus(row.original, currentUserId)"
          @click="emit('toggleStatus', row.original, row.original.status === 1)"
        />
      </div>
    </template>
    <template #empty>
      <div class="py-10 text-center text-muted">
        暂无用户
      </div>
    </template>
  </UTable>
</template>
