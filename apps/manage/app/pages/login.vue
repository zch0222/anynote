<script setup lang="ts">
/**
 * 超管登录页：UForm + Zod 校验，A0301 专有高亮警告，同源 redirect 安全回跳，
 * 会话失效被退回时显示后端给出的提示。
 */
import { useAdminSession } from '~/composables/auth/useAdminSession'
import { loginFormSchema, safeRedirect } from '~/lib/schemas/auth'

definePageMeta({ layout: 'auth' })

const schema = loginFormSchema
type LoginForm = { username: string; password: string }

const route = useRoute()
const session = useAdminSession()
const state = reactive<LoginForm>({ username: '', password: '' })
const submitting = ref(false)
const errorMsg = ref('')
const nonAdminBlocked = ref(false)
// 会话失效被退回登录页时只提示一次，取用后清空
const sessionNotice = ref(session.notice.value)
session.notice.value = ''

async function onSubmit() {
  if (submitting.value) return
  submitting.value = true
  errorMsg.value = ''
  nonAdminBlocked.value = false
  try {
    const res = await $fetch<{ code: string; msg: string; data: unknown }>('/api/auth/login', {
      method: 'POST',
      body: { username: state.username, password: state.password },
      credentials: 'same-origin',
    })
    if (res.code === '00000') {
      session.profile.value = res.data as never
      session.loaded.value = true
      await navigateTo(safeRedirect(route.query.redirect))
      return
    }
    errorMsg.value = res.msg || '请求失败，请稍后重试'
  } catch (error) {
    const err = error as { status?: number; data?: { code?: string; msg?: string } }
    if (err.status === 403 && err.data?.code === 'A0301') {
      nonAdminBlocked.value = true
    } else if (err.status === 502) {
      errorMsg.value = '认证服务暂时不可用'
    } else if (err.data?.msg) {
      errorMsg.value = err.data.msg
    } else {
      errorMsg.value = '请求失败，请稍后重试'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="space-y-1">
        <h1 class="text-lg font-semibold text-default">
          Anynote 服务管理后台
        </h1>
        <p class="text-sm text-muted">
          仅限超级管理员登录
        </p>
      </div>
    </template>

    <UAlert
      v-if="nonAdminBlocked"
      color="error"
      variant="subtle"
      icon="i-lucide-shield-x"
      title="当前账号不是超级管理员，无法进入管理后台（已自动注销本次登录尝试）"
      class="mb-4"
    />
    <UAlert
      v-else-if="errorMsg"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="errorMsg"
      class="mb-4"
    />
    <UAlert
      v-else-if="sessionNotice"
      color="warning"
      variant="subtle"
      icon="i-lucide-shield-alert"
      :title="sessionNotice"
      class="mb-4"
    />

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="用户名" name="username">
        <UInput v-model="state.username" class="w-full" autocomplete="username" />
      </UFormField>
      <UFormField label="密码" name="password">
        <UInput
          v-model="state.password"
          type="password"
          class="w-full"
          autocomplete="current-password"
        />
      </UFormField>
      <UButton type="submit" block :loading="submitting" :disabled="submitting">
        登录
      </UButton>
    </UForm>
  </UCard>
</template>
