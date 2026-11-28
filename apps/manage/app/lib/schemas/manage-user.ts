/**
 * 管理端用户纯函数与 Schema：分页解析、角色/状态文案、自我保护判定、重置密码校验。
 */
import { pageBeanSchema } from '@anynote/api-core'
import { z } from 'zod'

/** 管理端用户列表项契约 */
export const manageUserSchema = z.object({
  userId: z.number(),
  username: z.string(),
  nickname: z.string().nullish(),
  email: z.string().nullish(),
  phoneNumber: z.string().nullish(),
  status: z.number().nullish(),
  roleId: z.number().nullish(),
  roleName: z.string().nullish(),
  roleKey: z.string().nullish(),
  loginDate: z.string().nullish(),
  createTime: z.string().nullish(),
})

export type ManageUser = z.infer<typeof manageUserSchema>

/** 管理端用户分页响应 */
export const manageUserPageSchema = pageBeanSchema(manageUserSchema)

/** 角色标识到展示文案 */
const ROLE_LABELS: Record<string, string> = {
  ADMIN_X: '超级管理员',
  TEACHER: '教师',
  STUDENT: '学生',
  MEMBER: '成员',
}

/**
 * 角色展示文案
 *
 * @param roleKey 角色标识
 * @return 展示文案
 */
export function roleLabel(roleKey?: string | null): string {
  if (!roleKey) return '无角色'
  return ROLE_LABELS[roleKey] ?? roleKey
}

/**
 * 角色徽章颜色
 *
 * @param roleKey 角色标识
 * @return Nuxt UI 颜色
 */
export function roleColor(roleKey?: string | null): 'error' | 'info' | 'neutral' {
  if (roleKey === 'ADMIN_X') return 'error'
  if (roleKey === 'TEACHER') return 'info'
  return 'neutral'
}

/**
 * 账号状态展示文案
 *
 * @param status 账号状态
 * @return 展示文案
 */
export function userStatusLabel(status?: number | null): string {
  return status === 1 ? '已停用' : '正常'
}

/**
 * 账号状态徽章颜色
 *
 * @param status 账号状态
 * @return Nuxt UI 颜色
 */
export function userStatusColor(status?: number | null): 'success' | 'error' {
  return status === 1 ? 'error' : 'success'
}

/**
 * 是否当前登录账号
 *
 * @param userId 目标用户id
 * @param currentUserId 当前登录用户id
 * @return 是否本人
 */
export function isCurrentUser(userId: number, currentUserId?: number | null): boolean {
  return currentUserId != null && userId === currentUserId
}

/**
 * 是否允许重置该用户密码
 *
 * @param user 目标用户
 * @param currentUserId 当前登录用户id
 * @return 是否允许
 */
export function canResetPassword(user: ManageUser, currentUserId?: number | null): boolean {
  return !isCurrentUser(user.userId, currentUserId)
}

/**
 * 是否允许修改该用户的超级管理员身份
 *
 * @param user 目标用户
 * @param currentUserId 当前登录用户id
 * @return 是否允许
 */
export function canToggleSuperAdmin(user: ManageUser, currentUserId?: number | null): boolean {
  return !isCurrentUser(user.userId, currentUserId)
}

/**
 * 是否允许停用或启用该用户
 *
 * @param user 目标用户
 * @param currentUserId 当前登录用户id
 * @return 是否允许
 */
export function canToggleStatus(user: ManageUser, currentUserId?: number | null): boolean {
  return !isCurrentUser(user.userId, currentUserId)
}

/** 重置密码表单校验 */
export const resetPasswordFormSchema = z
  .object({
    newPassword: z
      .string()
      .min(1, '请输入新密码')
      .regex(
        /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])[\x21-\x7E]{8,15}$/,
        '密码必须是8到15位，且包含大写字母、小写字母和数字，可包含特殊字符（不含空格）',
      ),
    confirmPassword: z.string().min(1, '请再次输入新密码'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  })

export type ResetPasswordForm = z.infer<typeof resetPasswordFormSchema>

/**
 * 校验重置密码表单
 *
 * @param value 表单值
 * @return 首条错误文案，通过时返回 null
 */
export function validateResetPasswordForm(value: ResetPasswordForm): string | null {
  const result = resetPasswordFormSchema.safeParse(value)
  return result.success ? null : result.error.issues[0]?.message ?? '输入不合法'
}
