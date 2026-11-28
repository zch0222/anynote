/**
 * 管理端用户纯函数单测：角色/状态文案、自我保护判定、重置密码校验与分页契约。
 *
 * @author 称霸幼儿园
 */
import { describe, expect, it } from 'vitest'
import {
  canResetPassword,
  canToggleStatus,
  canToggleSuperAdmin,
  isCurrentUser,
  manageUserPageSchema,
  manageUserSchema,
  resetPasswordFormSchema,
  roleColor,
  roleLabel,
  userStatusColor,
  userStatusLabel,
  validateResetPasswordForm,
  type ManageUser,
} from '~/lib/schemas/manage-user'

function user(overrides: Partial<ManageUser> = {}): ManageUser {
  return {
    userId: 100,
    username: 'tester01',
    nickname: '测试用户',
    email: '',
    phoneNumber: '',
    status: 0,
    roleId: 4,
    roleName: 'member',
    roleKey: 'MEMBER',
    loginDate: null,
    createTime: '2026-11-28T10:00:00.000+08:00',
    ...overrides,
  }
}

describe('roleLabel', () => {
  it('已知角色返回中文文案', () => {
    expect(roleLabel('ADMIN_X')).toBe('超级管理员')
    expect(roleLabel('TEACHER')).toBe('教师')
    expect(roleLabel('STUDENT')).toBe('学生')
    expect(roleLabel('MEMBER')).toBe('成员')
  })

  it('无角色与未知角色有稳定兜底', () => {
    expect(roleLabel(null)).toBe('无角色')
    expect(roleLabel('')).toBe('无角色')
    expect(roleLabel('CUSTOM')).toBe('CUSTOM')
  })
})

describe('roleColor', () => {
  it('超级管理员用错误色强调，教师用信息色，其余中性', () => {
    expect(roleColor('ADMIN_X')).toBe('error')
    expect(roleColor('TEACHER')).toBe('info')
    expect(roleColor('MEMBER')).toBe('neutral')
    expect(roleColor(null)).toBe('neutral')
  })
})

describe('userStatusLabel', () => {
  it('0 为正常，1 为已停用', () => {
    expect(userStatusLabel(0)).toBe('正常')
    expect(userStatusLabel(1)).toBe('已停用')
    expect(userStatusLabel(null)).toBe('正常')
  })
})

describe('userStatusColor', () => {
  it('停用用错误色，正常用成功色', () => {
    expect(userStatusColor(0)).toBe('success')
    expect(userStatusColor(1)).toBe('error')
  })
})

describe('自我保护判定', () => {
  it('当前账号不允许重置密码、修改超管身份或停用/启用', () => {
    const me = user({ userId: 100 })
    expect(isCurrentUser(100, 100)).toBe(true)
    expect(canResetPassword(me, 100)).toBe(false)
    expect(canToggleSuperAdmin(me, 100)).toBe(false)
    expect(canToggleStatus(me, 100)).toBe(false)
  })

  it('其他账号允许操作', () => {
    const other = user({ userId: 101 })
    expect(isCurrentUser(101, 100)).toBe(false)
    expect(canResetPassword(other, 100)).toBe(true)
    expect(canToggleSuperAdmin(other, 100)).toBe(true)
    expect(canToggleStatus(other, 100)).toBe(true)
  })

  it('当前用户未知时不做自我限制', () => {
    expect(isCurrentUser(100, null)).toBe(false)
    expect(canResetPassword(user(), undefined)).toBe(true)
  })
})

describe('validateResetPasswordForm', () => {
  it('允许特殊字符并通过校验', () => {
    expect(validateResetPasswordForm({
      newPassword: 'Abcdef1*',
      confirmPassword: 'Abcdef1*',
    })).toBeNull()
  })

  it('空密码给出必填提示', () => {
    expect(validateResetPasswordForm({ newPassword: '', confirmPassword: '' })).toBe('请输入新密码')
  })

  it('缺少大写、小写或数字时拒绝', () => {
    expect(validateResetPasswordForm({ newPassword: 'abcdef1*', confirmPassword: 'abcdef1*' }))
      .toBe('密码必须是8到15位，且包含大写字母、小写字母和数字，可包含特殊字符（不含空格）')
    expect(validateResetPasswordForm({ newPassword: 'ABCDEF1*', confirmPassword: 'ABCDEF1*' }))
      .toBe('密码必须是8到15位，且包含大写字母、小写字母和数字，可包含特殊字符（不含空格）')
    expect(validateResetPasswordForm({ newPassword: 'Abcdefg*', confirmPassword: 'Abcdefg*' }))
      .toBe('密码必须是8到15位，且包含大写字母、小写字母和数字，可包含特殊字符（不含空格）')
  })

  it('拒绝空格与超长密码', () => {
    expect(validateResetPasswordForm({ newPassword: 'Abcdef1 *', confirmPassword: 'Abcdef1 *' }))
      .toBe('密码必须是8到15位，且包含大写字母、小写字母和数字，可包含特殊字符（不含空格）')
    expect(validateResetPasswordForm({ newPassword: 'Abcdef1234567890', confirmPassword: 'Abcdef1234567890' }))
      .toBe('密码必须是8到15位，且包含大写字母、小写字母和数字，可包含特殊字符（不含空格）')
  })

  it('两次输入不一致时拒绝', () => {
    expect(validateResetPasswordForm({ newPassword: 'Abcdef1*', confirmPassword: 'Abcdef2*' }))
      .toBe('两次输入的密码不一致')
  })

  it('表单 Schema 与校验函数结论一致', () => {
    expect(resetPasswordFormSchema.safeParse({ newPassword: 'Abcdef1*', confirmPassword: 'Abcdef1*' }).success)
      .toBe(true)
  })
})

describe('manageUserPageSchema', () => {
  it('解析分页响应并把缺失 rows 归一为空数组', () => {
    const parsed = manageUserPageSchema.parse({
      current: 1,
      pages: 1,
      total: 1,
      rows: [user()],
    })
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]?.username).toBe('tester01')
    expect(manageUserPageSchema.parse({ total: 0 }).rows).toEqual([])
  })

  it('单个用户允许可空字段', () => {
    const parsed = manageUserSchema.parse({ userId: 1, username: 'u' })
    expect(parsed.nickname).toBeUndefined()
    expect(parsed.roleKey).toBeUndefined()
  })
})
