import { defineConfig, devices } from "@playwright/test";

/**
 * M8.3 端到端测试。
 *
 * 跑的是**生产构建 + 真实后端栈**，不是 mock：
 * 先 `pnpm --filter web build`，再起完整 docker 栈（见 README「启动指南」场景 A），
 * 然后 `pnpm --filter web test:e2e`。
 *
 * 这些用例不进默认 `pnpm test`，也不进无中间件的 CI——与
 * `test:integration:auth` 同样属于「需要真实链路」的一类。
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * 本地栈可能挂在自签 HTTPS 域名上（见 `docker-compose.yaml` 的 `NEXT_PUBLIC_APP_URL`）。
 * 只有**显式声明**了该地址才放宽证书校验，默认的 http://localhost 不受影响——
 * 否则这个开关会静默削弱所有本地用例的传输安全假设。
 */
const allowInsecureTls = baseURL.startsWith("https:");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.output",
  globalSetup: "./e2e/global-setup.ts",
  // 真实后端下并发写同一批数据容易互相干扰，按文件串行更稳
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    // 登录态由 global-setup 预先拿到；需要匿名的用例自行 test.use 覆盖
    storageState: "./e2e/.auth/state.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "zh-CN",
    ignoreHTTPSErrors: allowInsecureTls,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile-.*\.spec\.ts/ },
    // M10.0：移动端门禁。`workers: 1` 下多一个 project 会让全量 E2E 时间翻倍，
    // 所以两边按文件名分工——移动端用例只在 mobile project 跑，桌面用例只在 chromium 跑。
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile-.*\.spec\.ts/,
    },
  ],
  /**
   * 只在**没有显式给 E2E_BASE_URL** 时才尝试拉起本地 `next start`。
   *
   * 显式给了地址就说明栈已经在别处跑着（Docker 容器、自签 HTTPS 域名、
   * 局域网机器），此时探测必然失败：`webServer.url` 的健康检查不吃
   * `use.ignoreHTTPSErrors`，自签证书会让它一直等到 120s 超时。
   */
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: "npx next start",
          url: baseURL,
          // 本机通常已经起着生产前端，直接复用，避免 M7.6 记录的「同一 .next 上两个 next start」问题
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }),
});
