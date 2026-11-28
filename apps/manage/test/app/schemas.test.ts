/**
 * M20.2 纯函数与 Schema 单测：时间窗解析、格式化、登录表单与 redirect 安全回跳。
 */
import { describe, expect, it } from 'vitest'
import {
  agentRunStatsSchema,
  formatCount,
  formatMs,
  formatSuccessRate,
  resolveStatsWindow,
} from '~/lib/schemas/agent-stats'
import { loginFormSchema, safeRedirect } from '~/lib/schemas/auth'

describe('resolveStatsWindow', () => {
  const now = new Date('2026-11-27T12:00:00Z')

  it('24h 窗口按小时分桶', () => {
    const win = resolveStatsWindow('24h', now)
    expect(win.granularity).toBe('HOUR')
    expect(win.startedFrom).toBe('2026-11-26T12:00:00.000Z')
    expect(win.startedTo).toBe(now.toISOString())
  })

  it('7d 窗口按天分桶', () => {
    const win = resolveStatsWindow('7d', now)
    expect(win.granularity).toBe('DAY')
    expect(win.startedFrom).toBe('2026-11-20T12:00:00.000Z')
  })

  it('30d 窗口跨度 30 天', () => {
    const win = resolveStatsWindow('30d', now)
    expect(win.startedFrom).toBe('2026-10-28T12:00:00.000Z')
  })
})

describe('格式化纯函数', () => {
  it('formatMs 毫秒与秒分档', () => {
    expect(formatMs(500)).toBe('500 ms')
    expect(formatMs(2500)).toBe('2.50 s')
    expect(formatMs(null)).toBe('—')
    expect(formatMs(Number.NaN)).toBe('—')
  })

  it('formatCount 大数字紧凑显示', () => {
    expect(formatCount(999)).toBe('999')
    expect(formatCount(15_000)).toBe('15.0K')
    expect(formatCount(2_500_000)).toBe('2.50M')
    expect(formatCount(undefined)).toBe('—')
  })

  it('formatSuccessRate 百分比与零除', () => {
    expect(formatSuccessRate(9, 10)).toBe('90.0%')
    expect(formatSuccessRate(0, 0)).toBe('—')
  })
})

describe('agentRunStatsSchema', () => {
  it('接受后端完整结构', () => {
    const parsed = agentRunStatsSchema.parse({
      totalRuns: 3,
      succeededRuns: 2,
      avgToolCalls: 1.5,
      series: [{ bucketStart: '2026-11-27T00:00:00', totalRuns: 1 }],
      models: [{ provider: 'p', model: 'm', runs: 2, totalTokens: 10 }],
      outcomes: [{ outcome: 'ANSWERED', count: 2 }],
    })
    expect(parsed.totalRuns).toBe(3)
    expect(parsed.models?.[0]?.runs).toBe(2)
  })
})

describe('loginFormSchema', () => {
  it('空用户名密码给出确认文案', () => {
    const result = loginFormSchema.safeParse({ username: '', password: '' })
    expect(result.success).toBe(false)
    const messages = result.error?.issues.map((i) => i.message) ?? []
    expect(messages).toContain('请输入用户名')
    expect(messages).toContain('请输入密码')
  })

  it('合法输入通过', () => {
    expect(loginFormSchema.safeParse({ username: 'root', password: 'x' }).success).toBe(true)
  })
})

describe('safeRedirect', () => {
  it('放行站内相对路径', () => {
    expect(safeRedirect('/ai/models')).toBe('/ai/models')
  })

  it('拒绝绝对 URL 与协议相对路径', () => {
    expect(safeRedirect('https://evil.com')).toBe('/ai/overview')
    expect(safeRedirect('//evil.com')).toBe('/ai/overview')
    expect(safeRedirect(undefined)).toBe('/ai/overview')
    expect(safeRedirect('')).toBe('/ai/overview')
  })
})
