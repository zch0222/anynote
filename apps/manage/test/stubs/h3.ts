/**
 * vitest 桩：h3 是 Nitro 运行时依赖，纯单测只导入不执行 handler 装配层。
 * pnpm 严格隔离下应用无法直接解析传递依赖，这里提供模块加载占位。
 */
export const defineEventHandler = (handler: unknown) => handler
export const readBody = () => Promise.resolve(undefined)
export const getHeader = () => undefined
export const getCookie = () => undefined
export const setCookie = () => {}
export const setResponseStatus = () => {}
export const setHeader = () => {}
export const getMethod = () => 'GET'
export const getRequestURL = () => new URL('http://localhost/')
export const getRouterParam = () => undefined
