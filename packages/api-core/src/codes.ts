/**
 * 后端 `ResData.code` 中前端与 CLI 都需要分支处理的业务码。
 *
 * 完整表在 `.claude/context/backend.md`；这里只收录"调用方需要据此改变行为"的那些，
 * 避免变成第二份 ResCode 定义。
 */
export const RES_CODE = {
  /** 成功 */
  SUCCESS: "00000",
  /** 参数错误 */
  BAD_PARAM: "A0160",
  /** 未授权 / 登录态失效 */
  UNAUTHORIZED: "A0301",
  /** 缺少 accessToken */
  MISSING_TOKEN: "A0350",
  /** refreshToken 失效 */
  REFRESH_INVALID: "A0311",
  /** 乐观并发冲突：笔记已被其他会话更新 */
  VERSION_CONFLICT: "A0409",
  /** 通用业务错误 */
  BUSINESS: "B0001",
  /** 内部服务错误 */
  INNER_SERVICE: "B0400",
} as const;

export type ResCodeValue = (typeof RES_CODE)[keyof typeof RES_CODE];
