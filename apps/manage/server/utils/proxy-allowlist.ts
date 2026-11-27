/**
 * BFF 代理最小权限白名单与路径段穿越拦截。
 * 第一阶段仅放行 /ai/v1/admin/**；任何不在白名单内的请求在 Nitro 层直接 403。
 */

const ALLOWED_PREFIXES = [/^\/ai\/v1\/admin(\/|$)/]

/** 逐段解码并检测 . / .. 穿越段（含双重编码与大小写变形） */
export function hasPathTraversal(path: string): boolean {
  for (const segment of path.split('/')) {
    let decoded = segment
    try {
      // 双重解码：%252e%252e 解码两次后仍是 ..
      for (let i = 0; i < 2; i += 1) {
        const next = decodeURIComponent(decoded)
        if (next === decoded) break
        decoded = next
      }
    } catch {
      return true
    }
    if (decoded === '..' || decoded === '.') return true
  }
  return false
}

/** 路径必须以 / 开头、无穿越段、且命中管理域前缀白名单 */
export function isAllowedProxyPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (hasPathTraversal(path)) return false
  if (path.includes('\\')) return false
  return ALLOWED_PREFIXES.some((pattern) => pattern.test(path))
}
