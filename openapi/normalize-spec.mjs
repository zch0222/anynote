/**
 * 把 springdoc 拉回来的原始 spec 归一化成可作为 baseline 的确定性 JSON。
 *
 * 解决两个问题（见 docs/refactor/FRONTEND_MILESTONES.md §6）：
 *
 * 1. springdoc 按请求上下文推导 `servers[0].url`，在 docker 里就是容器运行时 IP
 *    （如 http://172.19.0.11:8083）。Docker 每次起栈重新分配，导致 CI 的
 *    `git diff --exit-code openapi/specs/` 永远红。这里直接剥离 `servers`——
 *    openapi-typescript 不消费它（生成的 6 份 TS 里 `servers` 出现 0 次），
 *    前端按 M3.2 用 `baseUrl: '/api/proxy'`，运行时也不读。
 *
 * 2. 本仓库业务错误也是 HTTP 200（靠 ResData.code 区分），所以 `curl -f` 拦不住
 *    「网关返回 {"code":"B0001"} 却被当成 spec 写进 baseline」。M0.1 运维发现第 4 条
 *    就撞过这个。这里做结构校验，识别出来直接失败，让调用方保留原 baseline。
 */

/** 递归按 key 排序，消除 springdoc 可能的 key 顺序抖动。数组顺序是语义的一部分，保持不动。 */
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value === null || typeof value !== "object") return value;

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeysDeep(value[key]);
  }
  return sorted;
}

/**
 * @param {string} raw   网关返回的原始响应体
 * @param {string} service  服务名，仅用于错误信息
 * @returns {{ ok: true, json: string, pathCount: number } | { ok: false, error: string }}
 */
export function normalizeSpec(raw, service = "unknown") {
  if (raw.trim() === "") {
    return { ok: false, error: `${service}: 响应为空` };
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `${service}: 响应不是合法 JSON（${err.message}）` };
  }

  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return { ok: false, error: `${service}: 响应顶层不是 JSON 对象` };
  }

  // ResData 错误体：HTTP 200 但内容是 {"code":"B0001","msg":...}，curl -f 拦不住
  if (typeof doc.openapi !== "string") {
    if (typeof doc.code === "string") {
      return {
        ok: false,
        error: `${service}: 网关返回 ResData 错误体（code=${doc.code}${doc.msg ? `, msg=${doc.msg}` : ""}）而非 spec，通常是服务未就绪或缺 anynote-common-swagger 依赖`,
      };
    }
    return { ok: false, error: `${service}: 缺少顶层 "openapi" 字段，不是 OpenAPI 文档` };
  }

  if (doc.paths === null || typeof doc.paths !== "object" || Array.isArray(doc.paths)) {
    return { ok: false, error: `${service}: 缺少 "paths" 对象` };
  }

  const pathCount = Object.keys(doc.paths).length;
  if (pathCount === 0) {
    return { ok: false, error: `${service}: "paths" 为空，疑似服务未完成注册或注解缺失` };
  }

  // 唯一的漂移噪声来源
  const { servers: _servers, ...withoutServers } = doc;

  return { ok: true, json: JSON.stringify(sortKeysDeep(withoutServers)), pathCount };
}
