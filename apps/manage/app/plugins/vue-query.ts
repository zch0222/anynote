import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'

/** 注册 TanStack Vue Query：与 apps/web 一致的缓存语义（retry 关闭、30s staleTime） */
export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000 },
    },
  })
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
})
