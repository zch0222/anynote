import { defineConfig } from "vitest/config";

/**
 * 端到端用例：驱动构建产物 dist/anynote.mjs，打真实的本地 Anynote 栈。
 * 与 apps/web 的 `*.live.test.ts` 同一套路，**不进默认 `pnpm test` 与 CI**。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["e2e/*.live.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
