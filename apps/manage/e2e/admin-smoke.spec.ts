/**
 * M20.6 管理后台全链路冒烟：登录闭环、概览看板、模型配置页、非超管阻断，
 * 以及评审修复回归（全局外壳、加载失败保护、筛选与 URL 同步、会话复核、草稿保护）。
 * 需真实 Docker 栈；账号由环境变量注入（默认 dev 库验收账号）。
 */
import { expect, test, type Page } from '@playwright/test'

const ADMIN_USER = process.env.MANAGE_E2E_ADMIN_USER ?? 'e2emadmin01'
const ADMIN_PASS = process.env.MANAGE_E2E_ADMIN_PASS ?? 'ManageTest123'
const NORMAL_USER = process.env.MANAGE_E2E_NORMAL_USER ?? 'e2emnormal01'

/** 以超管账号登录并等待进入概览 */
async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.getByLabel('用户名').fill(ADMIN_USER)
  await page.getByLabel('密码').fill(ADMIN_PASS)
  await page.getByRole('button', { name: /登录/ }).click()
  await expect(page).toHaveURL(/\/ai\/overview/, { timeout: 15000 })
}

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
    await expect(page.getByRole('heading', { name: '模型供应商目录' })).toBeVisible({ timeout: 10000 })
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


  test('深色模式概览看板可辨', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/login')
    await page.getByLabel('用户名').fill(ADMIN_USER)
    await page.getByLabel('密码').fill(ADMIN_PASS)
    await page.getByRole('button', { name: /登录/ }).click()
    await expect(page).toHaveURL(/\/ai\/overview/, { timeout: 15000 })
    await expect(page.getByText('总运行')).toBeVisible({ timeout: 15000 })
    // 深色下背景应非纯白：校验根元素背景不是浅色系
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).not.toBe('rgb(255, 255, 255)')
  })

  test('未登录访问受保护页跳转登录', async ({ page }) => {
    await page.goto('/ai/overview')
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 })
  })
})

test.describe('评审修复回归', () => {
  test('登录后渲染后台外壳：品牌、侧栏导航、主题切换与账号菜单', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page.getByText('Anynote Admin')).toBeVisible()
    for (const name of ['运行概览', '模型与供应商', '知识检索参数', '运行轨迹 (Trace)']) {
      await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /M20admin|e2emadmin01/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible()
    await page.getByRole('link', { name: '模型与供应商', exact: true }).click()
    await expect(page).toHaveURL(/\/ai\/models/)
    await expect(page.getByRole('heading', { name: '模型供应商目录' })).toBeVisible()
  })

  test('逻辑模型配置加载失败时显示错误与重试，不渲染可保存的卡片', async ({ page }) => {
    await loginAsAdmin(page)
    const logicalPattern = '**/api/proxy/ai/v1/admin/model-providers/logical/**'
    await page.route(logicalPattern, (route) => route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'B0400', msg: '认证服务暂时不可用', data: null }),
    }))
    await page.goto('/ai/models')
    await expect(page.getByRole('heading', { name: '模型供应商目录' })).toBeVisible()
    await expect(page.getByText('加载失败，请稍后重试')).toBeVisible()
    await expect(page.getByRole('button', { name: '保存配置' })).toHaveCount(0)

    await page.unroute(logicalPattern)
    await page.getByRole('button', { name: '重试' }).click()
    await expect(page.getByRole('button', { name: '保存配置' })).toHaveCount(3)
  })

  test('运行列表：结果筛选使用真实结果值，筛选条件写入 URL 并可回填', async ({ page }) => {
    await loginAsAdmin(page)
    const listRequest = page.waitForRequest((req) => /\/agent-runs\?/.test(req.url()))
    await page.goto('/ai/traces?outcome=NOT_FOUND&page=2')
    const initial = new URL((await listRequest).url())
    expect(initial.searchParams.get('outcome')).toBe('NOT_FOUND')
    expect(initial.searchParams.get('pageNum')).toBe('2')
    await expect(page.getByRole('combobox')).toHaveText('未找到')

    await page.getByRole('combobox').click()
    await expect(page.getByRole('option', { name: '成功', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: '正常回答' }).click()
    await expect(page).toHaveURL(/outcome=ANSWERED/)
    expect(new URL(page.url()).searchParams.get('page')).toBeNull()
  })

  test('会话复核：窗口聚焦发现失权后清空会话、退回登录页并提示', async ({ page }) => {
    await loginAsAdmin(page)
    // 该账号的 ADMIN_X 已被后端撤销
    await page.route('**/api/auth/me', (route) => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'A0301', msg: '仅超级管理员可登录管理后台', data: null }),
    }))
    // 只推进 Date 越过复核节流间隔，定时器保持真实运行
    await page.clock.setFixedTime(new Date(Date.now() + 61_000))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page).toHaveURL(/\/login$/, { timeout: 10000 })
    await expect(page.getByText('仅超级管理员可登录管理后台')).toBeVisible()
  })

  test('检索参数：有未保存修改时后台重取不覆盖草稿，并提示服务器版本变化', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/ai/retrieval')

    const settingsUrl = '**/api/proxy/ai/v1/admin/retrieval-settings'
    const real = await (await page.request.get('/api/proxy/ai/v1/admin/retrieval-settings')).json()
    const serverRrfK = String(real.data.rrfK ?? 60)
    const draft = serverRrfK === '88' ? '89' : '88'
    const remote = ['77', '78', '79'].find((value) => value !== serverRrfK && value !== draft)!
    const serverVersion = real.data.version ?? 0

    // 第一个数值输入框是 RRF 融合常数 k
    const rrfInput = page.locator('input[inputmode="decimal"]').first()
    await expect(rrfInput).toHaveValue(serverRrfK)
    await rrfInput.fill(draft)
    await expect(page.getByText('有未保存的修改')).toBeVisible()

    // 另一位管理员保存了新版本：之后的读取返回新版本
    await page.route(settingsUrl, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...real, data: { ...real.data, version: serverVersion + 1, rrfK: Number(remote) } }),
    }))
    // 只推进 Date 越过 staleTime，定时器保持真实运行；切回标签页的 visibilitychange 会冒泡到 window
    await page.clock.setFixedTime(new Date(Date.now() + 31_000))
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
    await expect(page.getByText(`服务器上的检索参数已更新为 v${serverVersion + 1}，你未保存的修改已保留；继续保存将覆盖该版本。`)).toBeVisible()
    await expect(rrfInput).toHaveValue(draft)
    await expect(page.getByText('有未保存的修改')).toBeVisible()

    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '放弃我的修改并加载最新' }).click()
    await expect(rrfInput).toHaveValue(remote)
    await expect(page.getByText('有未保存的修改')).toHaveCount(0)
  })
})
