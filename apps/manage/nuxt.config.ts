// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/eslint'],
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  devServer: { port: 3001 },
  runtimeConfig: {
    // 服务端内网网关地址（容器内 http://anynote-gateway:8080），不进入客户端包
    internalApiUrl:
      process.env.NUXT_INTERNAL_API_URL || process.env.INTERNAL_API_URL || 'http://localhost:8080',
    public: {
      appUrl: process.env.NUXT_PUBLIC_APP_URL || 'http://localhost:3001',
    },
  },
  typescript: { strict: true },
  nitro: { preset: 'node-server' },
  icon: {
    // 仅使用本地打包的 Lucide 图标集，运行时不外连 Iconify CDN
    provider: 'none',
    clientBundle: { scan: true },
  },
  eslint: { config: { stylistic: false } },
  compatibilityDate: '2026-11-27',
})
