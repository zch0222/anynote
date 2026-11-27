import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// h3 与 nitropack 是 Nitro 传递依赖，pnpm 严格隔离下应用层无法直接解析；
// 纯函数单测不执行 h3 装配层，故用桩模块替换（真实构建由 Nuxt/Nitro 正确解析）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'app/**/*.test.ts'],
    alias: {
      h3: fileURLToPath(new URL('./test/stubs/h3.ts', import.meta.url)),
      'nitropack/runtime': fileURLToPath(new URL('./test/stubs/nitropack-runtime.ts', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '~~': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
