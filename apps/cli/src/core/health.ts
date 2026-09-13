import { trimTrailingSlashes } from "./env";

/**
 * 网关健康探针。
 *
 * ⚠️ 这段逻辑单独成模块，是因为它踩过一个真实的坑：**只判断 `response.ok` 会假阳性**。
 * 把 api-url 误设成 Web 前端地址时，前端对未知路径回 `307 → /login → 200 HTML`，
 * fetch 默认跟随重定向，于是探针拿到 200 就报 `UP`，用户却在下一条命令上撞 404
 * ——自检工具给出与事实相反的结论，比不做自检更糟。
 *
 * 因此这里三重设防：禁止跟随重定向、要求 JSON content-type、要求 body 里有 `status`。
 */

/** Spring Boot actuator 的健康检查路径。 */
export const GATEWAY_HEALTH_PATH = "/actuator/health";

/** 探针超时：doctor 是自检命令，不该让用户等太久。 */
export const HEALTH_TIMEOUT_MS = 5_000;

/**
 * 探测网关可达性，返回给人与 agent 看的**短状态串**。
 *
 * 成功固定返回 `"UP"`（`doctor` 的既有对外契约，e2e 依赖），失败时返回可读原因：
 * `unreachable: ...` / `HTTP 404` / `HTTP 307 → /login(...)` / 非网关提示。
 * 不抛异常——自检命令的职责是把结论写进输出，而不是自己崩掉。
 */
export async function probeGateway(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = `${trimTrailingSlashes(apiUrl)}${GATEWAY_HEALTH_PATH}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      // 关键：不跟随重定向。跟随会把前端的 307 → /login 变成 200 HTML，正是假阳性的来源。
      redirect: "manual",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `unreachable: ${message}`;
  }

  // manual 模式下 3xx 会原样返回。被重定向说明这个地址不是网关（多半是前端）。
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") ?? "(未给出 Location)";
    return `HTTP ${response.status} → ${location}（被重定向，这个地址不是网关）`;
  }
  if (!response.ok) return `HTTP ${response.status}`;

  // actuator 回 application/vnd.spring-boot.actuator.v3+json；HTML 登录页在这里被挡掉。
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return `HTTP 200 但不是网关（content-type: ${contentType || "未知"}）`;
  }

  const body = (await response.json().catch(() => null)) as { status?: unknown } | null;
  if (typeof body?.status !== "string") {
    return "HTTP 200 但不是网关（响应里没有 status 字段）";
  }
  return body.status;
}
