/**
 * 用户管理页只读端到端用例：页面、搜索、列表字段、当前账号自我保护与重置密码弹窗。
 * 需真实 Docker 栈；账号由环境变量注入（默认 dev 库验收账号）。
 */
import { expect, test, type Page } from '@playwright/test'

const ADMIN_USER = process.env.MANAGE_E2E_ADMIN_USER ?? 'e2emadmin01'
const ADMIN_PASS = process.env.MANAGE_E2E_ADMIN_PASS ?? 'ManageTest123'
const NORMAL_USER = process.env.MANAGE_E2E_NORMAL_USER ?? 'e2emnormal01'

async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill(ADMIN_USER)
  await page.getByLabel('密码').fill(ADMIN_PASS)
  await page.getByRole('button', { name: /登录/ }).click()
  await expect(page).toHaveURL(/\/ai\/overview/, { timeout: 15000 })
}

async function searchUser(page: Page, username: string) {
  await page.getByPlaceholder('搜索用户名').fill(username)
  await page.getByRole('button', { name: '查询' }).click()
}

test.describe('用户管理', () => {
  test('侧栏进入用户管理并展示列表字段', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: '用户管理', exact: true }).click()
    await expect(page).toHaveURL(/\/system\/users/)
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible()
    await expect(page.getByPlaceholder('搜索用户名')).toBeVisible()
    for (const name of ['用户', '角色', '状态', '邮箱', '手机号', '注册时间', '最后登录', '操作']) {
      await expect(page.getByRole('columnheader', { name })).toBeVisible()
    }
  })

  test('按用户名搜索并展示角色与状态', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/system/users')
    await searchUser(page, NORMAL_USER)
    const row = page.getByRole('row').filter({ hasText: NORMAL_USER })
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row.getByText('成员')).toBeVisible()
    await expect(row.getByText('正常')).toBeVisible()
  })

  test('搜索不存在的用户名显示空状态', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/system/users')
    await searchUser(page, 'no-such-user-xyz')
    await expect(page.getByText('暂无用户')).toBeVisible({ timeout: 10000 })
  })

  test('当前账号的重置密码、取消超管与停用按钮均禁用', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/system/users')
    await searchUser(page, ADMIN_USER)
    const row = page.getByRole('row').filter({ hasText: ADMIN_USER })
    await expect(row.getByText('当前账号')).toBeVisible({ timeout: 10000 })
    await expect(row.getByRole('button', { name: '重置密码' })).toBeDisabled()
    await expect(row.getByRole('button', { name: '取消超级管理员' })).toBeDisabled()
    await expect(row.getByRole('button', { name: '停用账号' })).toBeDisabled()
  })

  test('重置密码弹窗展示确认说明与密码规则，取消后不提交', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/system/users')
    await searchUser(page, NORMAL_USER)
    const row = page.getByRole('row').filter({ hasText: NORMAL_USER })
    await row.getByRole('button', { name: '重置密码' }).click()
    await expect(page.getByText(`为 ${NORMAL_USER} 设置新密码。重置后该用户的所有登录会话将立即失效。`)).toBeVisible()
    await expect(page.getByLabel('新密码', { exact: true })).toBeVisible()
    await expect(page.getByLabel('确认新密码', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText(`为 ${NORMAL_USER} 设置新密码。重置后该用户的所有登录会话将立即失效。`)).toHaveCount(0)
  })
})
