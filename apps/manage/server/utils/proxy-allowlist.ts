/**
 * BFF 代理最小权限白名单与路径段穿越拦截。
 * 放行 /ai/v1/admin/** 与 /manage/**；任何不在白名单内的请求在 Nitro 层直接 403。
 */

const ALLOWED_PREFIXES = [/^\/ai\/v1\/admin(\/|$)/, /^\/manage(\/|$)/]

/** 单段最多解码次数，覆盖多重百分号编码 */
const MAX_DECODE_PASSES = 5

/** 解码后的段为 . / .. 或含路径分隔符即视为穿越 */
function isTraversalSegment(segment: string): boolean {
  return segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')
}

/** 单段判定：逐轮解码，任一轮为穿越段即拒绝；解码次数用尽仍在变化或解码失败同样拒绝 */
function isUnsafeSegment(segment: string): boolean {
  let decoded = segment
  for (let pass = 0; pass <= MAX_DECODE_PASSES; pass += 1) {
    if (isTraversalSegment(decoded)) return true
    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return true
    }
    if (next === decoded) return false
    decoded = next
  }
  return true
}

/** 逐段循环解码并检测 . / .. 穿越段与编码分隔符（含多重编码） */
export function hasPathTraversal(path: string): boolean {
  return path.split('/').some(isUnsafeSegment)
}

/** 路径必须以 / 开头、无穿越段、且命中管理域前缀白名单 */
export function isAllowedProxyPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (hasPathTraversal(path)) return false
  if (path.includes('\\')) return false
  return ALLOWED_PREFIXES.some((pattern) => pattern.test(path))
}
