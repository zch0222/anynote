/**
 * 登录后跳转目标的校验。
 *
 * `?next=` 是用户可控输入，直接 `router.push(next)` 会变成**开放重定向**：
 * `?next=https://evil.example` 或 `?next=//evil.example` 都能把刚登录的用户带走，
 * 顺手把 Referer 里的信息泄露出去。所以只接受**站内绝对路径**。
 */

/** 是不是安全的站内路径。 */
export function isSafeNextPath(value: string | null | undefined): value is string {
  if (!value) return false;
  // 必须以单个 / 开头：`//host` 与 `/\host` 都是协议相对 URL，会被浏览器当外站处理。
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//") || value.startsWith("/\\")) return false;
  // 控制字符（含换行、NUL）可用于绕过某些解析器，一律拒绝。逐个码位比较而不是写
  // 正则字符类：后者在源码里就是真实的控制字符，lint 会拦（noControlCharactersInRegex）。
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

/**
 * 取登录后要跳的路径；不安全就回落到 `fallback`。
 *
 * 不做 URL 解码——调用方拿到的已经是 `useSearchParams()` 解好的值，
 * 再解一次会把 `%2F%2Fevil` 变成 `//evil` 从而绕过上面的检查。
 */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  return isSafeNextPath(value) ? value : fallback;
}
