/**
 * M20.6 管理后台全链路冒烟：登录闭环、概览看板、模型配置页、非超管阻断。
 * 需真实 Docker 栈；账号由环境变量注入（默认 dev 库验收账号）。
 */
import { expect, test } from '@playwright/test'

const ADMIN_USER = process.env.MANAGE_E2E_ADMIN_USER ?? 'e2emadmin01'
const ADMIN_PASS = process.env.MANAGE_E2E_ADMIN_PASS ?? 'ManageTest123'
const NORMAL_USER = process.env.MANAGE_E2E_NORMAL_USER ?? 'e2emnormal01'

test.describe('管理后台冒烟', () => {
  test('超管登录并查看概览看板', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('用户名').fill(ADMIN_USER)
    await page.getByLabel('密码').fill(ADMIN_PASS)
    await page.getByRole('button', { name: /登录/ }).click()
    await expect(page).toHaveURL(/\/ai\/overview/, { timeout: 15000 })
    // 等待真实统计数据渲染（总运行卡片）
    await expect(page.getByText('总运行')).toBeVisible({ timeout: 15000 })
  })

  test('超管访问模型配置页', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('用户名').fill(ADMIN_USER)
    await page.getByLabel('密码').fill(ADMIN_PASS)
    await page.getByRole('button', { name: /登录/ }).click()
    await expect(page).toHaveURL(/\/ai\/overview/, { timeout: 15000 })
    await page.goto('/ai/models')
    await expect(page.getByText('模型供应商')).toBeVisible({ timeout: 10000 })
  })

  test('非超管登录被阻断并提示', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('用户名').fill(NORMAL_USER)
    await page.getByLabel('密码').fill(ADMIN_PASS)
    await page.getByRole('button', { name: /登录/ }).click()
    await expect(
      page.getByText('当前账号不是超级管理员，无法进入管理后台（已自动注销本次登录尝试）'),
    ).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('未登录访问受保护页跳转登录', async ({ page }) => {
    await page.goto('/ai/overview')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})
