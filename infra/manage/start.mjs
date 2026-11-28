/**
 * manage 容器启动入口：先校验配置，全部通过才加载 Nuxt 产物。
 * 校验失败立即退出非零，让容器编排层直接暴露配置错误。
 */
import { validateManageConfig } from './config.mjs'

const errors = validateManageConfig(process.env)
if (errors.length) {
  for (const error of errors) console.error(`[manage] ${error}`)
  process.exit(1)
}
await import('./.output/server/index.mjs')
