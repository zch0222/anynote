import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
