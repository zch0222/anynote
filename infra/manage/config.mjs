/**
 * manage 容器启动配置校验：缺关键环境变量时在启动前失败并给出明确指引，
 * 避免服务起来后 BFF 以错误上游静默代理。
 */

/** 必配项与缺失时的中文指引 */
const REQUIRED = [
  {
    key: 'NUXT_INTERNAL_API_URL',
    hint: 'Docker 内网网关地址，生产固定为 http://anynote-gateway:8080',
  },
  {
    key: 'NUXT_PUBLIC_APP_URL',
    hint: '管理后台对外来源（含协议与端口），须与 Nginx manage.YOUR_DOMAIN 一致，否则写请求被 Origin 校验拦截',
  },
]

/**
 * 校验环境变量，返回错误列表（纯函数便于单测）。
 * @param {Record<string, string | undefined>} env 进程环境
 * @returns {string[]} 错误描述列表，空数组表示通过
 */
export function validateManageConfig(env) {
  const errors = []
  for (const { key, hint } of REQUIRED) {
    const value = env[key]?.trim()
    if (!value) {
      errors.push(`缺少必配环境变量 ${key}：${hint}`)
      continue
    }
    // 报错不回显原值：地址里可能带 userinfo，容器日志会落进日志采集
    if (!/^https?:\/\//.test(value)) {
      errors.push(`${key} 必须是以 http(s):// 开头的完整地址`)
    }
  }
  if (env.DEPLOYMENT_ENV === 'production' && env.NUXT_PUBLIC_APP_URL?.startsWith('http://')) {
    errors.push('生产环境 NUXT_PUBLIC_APP_URL 必须使用 https://（Cookie 安全策略依赖）')
  }
  return errors
}
