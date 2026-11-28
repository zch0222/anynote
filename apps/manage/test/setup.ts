/**
 * vitest 全局准备：补齐被测 composable 依赖的 Nuxt 自动导入全局。
 *
 * @author 称霸幼儿园
 */
import { computed, toValue } from 'vue'
import { vi } from 'vitest'

vi.stubGlobal('computed', computed)
vi.stubGlobal('toValue', toValue)
