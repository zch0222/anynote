import { ApiError, RES_CODE } from "@anynote/api-core";

/**
 * 退出码契约：agent 不解析 stdout 也能据此决策。
 * 变更这张表等于变更对外契约，必须同步 docs/cli 与 .claude/skills。
 */
export const ExitCode = {
  /** 成功 */
  OK: 0,
  /** 业务失败（code != "00000" 且不属于下列特化） */
  BUSINESS: 1,
  /** 参数 / 用法错误：zod 校验失败、写操作缺 --yes */
  USAGE: 2,
  /** 未认证或凭据失效，刷新也没救回来 */
  AUTH: 3,
  /** 网关不可达、超时、DNS 失败 */
  NETWORK: 4,
  /** 乐观并发冲突：重读 → 合并 → 带新 version 重试 */
  CONFLICT: 5,
  /** 资源不存在 */
  NOT_FOUND: 6,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

/** 命令行用法错误：参数缺失、取值非法、写操作未确认。 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** 后端不可达 / 连接被拒 / 超时。 */
export class NetworkError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NetworkError";
  }
}

/** 资源不存在的后端业务码。 */
const NOT_FOUND_CODES = new Set(["A0404"]);

const CODE_EXIT: Record<string, ExitCodeValue> = {
  [RES_CODE.UNAUTHORIZED]: ExitCode.AUTH,
  [RES_CODE.MISSING_TOKEN]: ExitCode.AUTH,
  [RES_CODE.REFRESH_INVALID]: ExitCode.AUTH,
  [RES_CODE.VERSION_CONFLICT]: ExitCode.CONFLICT,
  [RES_CODE.BAD_PARAM]: ExitCode.USAGE,
};

/**
 * Node 的 fetch 失败统一是 TypeError("fetch failed")，真正的原因在 cause 上。
 * 这里只按"连不上"归类，HTTP 层面的失败走 ApiError 分支。
 */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof DOMException && error.name === "TimeoutError") return true;
  if (error instanceof TypeError && /fetch failed|network|socket/i.test(error.message)) return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  if (cause && typeof cause === "object" && "code" in cause) {
    const code = String((cause as { code?: unknown }).code);
    return ["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN", "ETIMEDOUT"].includes(code);
  }
  return false;
}

export function exitCodeFor(error: unknown): ExitCodeValue {
  if (error instanceof UsageError) return ExitCode.USAGE;
  if (error instanceof ApiError) {
    if (NOT_FOUND_CODES.has(error.code)) return ExitCode.NOT_FOUND;
    const mapped = CODE_EXIT[error.code];
    if (mapped !== undefined) return mapped;
    // 后端把鉴权失败也表达成 HTTP 401/403，业务码可能是通用码
    if (error.status === 401 || error.status === 403) return ExitCode.AUTH;
    if (error.status === 404) return ExitCode.NOT_FOUND;
    return ExitCode.BUSINESS;
  }
  if (isNetworkFailure(error)) return ExitCode.NETWORK;
  return ExitCode.BUSINESS;
}
