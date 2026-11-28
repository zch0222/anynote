/** 容器轻量健康检查端点 */
import { defineEventHandler } from 'h3'

export default defineEventHandler(() => ({ status: 'ok' }))
