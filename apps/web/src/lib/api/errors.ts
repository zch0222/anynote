/**
 * ResData 信封拆包已迁入 `@anynote/api-core`（`apps/web` 与 `apps/cli` 共用）。
 * 此处保留再导出，页面与 hook 的 import 路径不变。
 */
export { ApiError, unwrapEnvelope } from "@anynote/api-core/errors";

import { ApiError } from "@anynote/api-core/errors";

/**
 * 后端实现细节的指纹（UI 补稿 §12.0.3）。
 *
 * 这些词出现在 `msg` 里说明后端把内部组件名直接抛给了用户：
 * 「请确认 collab 服务已启动」「MinIO 连接失败」对使用者毫无意义，
 * 而且会暴露部署形态。原样透出还会让人以为是自己的操作有问题。
 */
const INTERNAL_DETAIL_PATTERN = /collab|minio|obs\b|nacos|rocketmq|elasticsearch|B0400|B0500/i;

/** 网络层错误：`fetch` 抛的 TypeError（"Failed to fetch"）与超时。 */
function isNetworkError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  if (error instanceof TypeError) return true;
  if (error instanceof Error && error.name === "TimeoutError") return true;
  return false;
}

/**
 * 把任意错误转成**可以直接显示给用户**的一句话（Q-02「错误文案」）。
 *
 * 三类输入、三种口径：
 * 1. 网络层失败 → 说清是网络，并给出唯一有效的动作（重试）；
 *    「Failed to fetch」这种原文对用户没有信息量。
 * 2. `ApiError` → 后端 `msg` 本来就是写给用户的业务原因（"笔记名已存在"），
 *    直接用；这是唯一应该透传原文的情况。
 * 3. 混进实现细节的文案 → 换成通用兜底，**原文打 `console.error` 留给排查**。
 *    静默吞掉会让线上问题无从定位，所以原文一定要落日志。
 *
 * 超时单独成一类而不是并进网络错误：用户能做的动作不同
 * （网络错误可能是断网，超时通常是服务端慢，重试的成功率差很多）。
 */
export function toUserMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return "网络连接超时，请检查网络后重试";
  }

  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (!raw.trim()) {
    return "服务暂时不可用，请稍后重试";
  }

  if (INTERNAL_DETAIL_PATTERN.test(raw)) {
    console.error("[api] 后端返回了实现细节，已替换为用户文案：", error);
    return "服务暂时不可用，请稍后重试";
  }

  if (error instanceof ApiError) {
    return raw;
  }

  return raw;
}
