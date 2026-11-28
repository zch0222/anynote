/**
 * vitest 桩：#imports 只在 Nuxt 运行时内可用，纯单测不启动 Nuxt。
 * useState 用模块级注册表模拟跨调用共享的响应式状态。
 *
 * @author 称霸幼儿园
 */
import { ref, type Ref } from 'vue'

const registry = new Map<string, Ref<unknown>>()

/** 模拟 Nuxt useState：同名键共享同一个响应式引用 */
export function useState<T>(key: string, init: () => T): Ref<T> {
  let state = registry.get(key) as Ref<T> | undefined
  if (!state) {
    state = ref(init()) as Ref<T>
    registry.set(key, state as Ref<unknown>)
  }
  return state
}

/** 测试辅助：清空 useState 注册表 */
export function resetUseStateRegistry() {
  registry.clear()
}
