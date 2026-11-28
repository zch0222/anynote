/**
 * 登录相关纯函数与 Schema。
 */
import { z } from 'zod'

export const loginFormSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
})

/** 仅允许站内相对路径，防开放重定向 */
export function safeRedirect(input: unknown): string {
  if (typeof input === 'string' && input.startsWith('/') && !input.startsWith('//')) {
    return input
  }
  return '/ai/overview'
}
