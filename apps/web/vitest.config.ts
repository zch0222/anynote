import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // 组件测试会 import 全局样式（katex.css / tiptap.css）。Vitest 不产出真实 CSS，
  // 但 Vite 仍会尝试加载项目 PostCSS 配置，而 tailwind 的 postcss 插件不是 Vite 插件，
  // 会直接报错。这里显式清空 postcss 插件，让 CSS 导入变成无害的空操作。
  css: {
    postcss: { plugins: [] },
  },
  // tsconfig 里是 jsx: "preserve"（Next.js 需要），Vite 8 的 oxc transformer 会照搬该设置，
  // 导致测试里的 JSX 原样输出、解析报错。这里显式指定 automatic runtime 覆盖它。
  oxc: {
    jsx: {
      runtime: "automatic",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      // shadcn 生成的原件属于 vendored 代码，与 biome.json 的 ignore 保持一致
      "src/components/ui/**",
    ],
    clearMocks: true,
    restoreMocks: true,
  },
});
