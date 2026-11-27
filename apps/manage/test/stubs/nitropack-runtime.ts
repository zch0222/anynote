/** vitest 桩：nitropack/runtime 仅在真实 Nitro 容器内运行，纯单测不会执行到 */
export const useRuntimeConfig = () => ({
  internalApiUrl: 'http://localhost:8080',
  public: { appUrl: 'http://localhost:3001' },
})
