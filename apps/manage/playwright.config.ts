/**
 * manage 端到端配置：连本机 Docker 全栈（BFF 3080 或 dev 3001），
 * 默认不起本地服务，依赖真实栈；用例账号经环境变量注入。
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.MANAGE_E2E_BASE_URL ?? 'http://localhost:3080',
    colorScheme: 'light',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
