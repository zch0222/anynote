/**
 * 浏览器侧 typed API 客户端：指向同源 Nitro BFF 代理。
 * 契约类型全部派生自 @anynote/api-client，禁止手写 fetch 直调后端。
 */
import type { paths as AiPaths } from '@anynote/api-client/src/ai'
import type { paths as ManagePaths } from '@anynote/api-client/src/manage'
import createClient from 'openapi-fetch'

export const aiClient = createClient<AiPaths>({
  baseUrl: '/api/proxy/ai',
  cache: 'no-store',
  redirect: 'error',
})

export const manageClient = createClient<ManagePaths>({
  baseUrl: '/api/proxy/manage',
  cache: 'no-store',
  redirect: 'error',
})
