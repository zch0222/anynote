/**
 * composable 测试辅助：在带 QueryClient 的注入上下文与独立作用域内执行 composable，
 * 每次调用新建 QueryClient 且关闭重试。
 *
 * @author 称霸幼儿园
 */
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { EffectScope, createApp } from 'vue'

/**
 * 执行 composable 并返回其结果。
 * @param fn 接收新建 QueryClient 的待测逻辑
 * @return composable 结果、QueryClient 与清理函数
 */
export function runWithQueryClient<T>(fn: (queryClient: QueryClient) => T) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const app = createApp({ render: () => null })
  app.use(VueQueryPlugin, { queryClient })
  const scope = new EffectScope()
  const result = app.runWithContext(() => scope.run(() => fn(queryClient))) as T
  return {
    result,
    queryClient,
    /** 结束作用域并清空缓存 */
    dispose: () => {
      scope.stop()
      queryClient.clear()
    },
  }
}
