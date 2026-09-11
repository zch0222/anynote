// Lighthouse 跑分的纯逻辑（参数解析、Cookie 组装、阈值判定）。
// lighthouse.mjs 负责起浏览器与读文件，这里只负责算，便于单测。

/** M8.3 质量门槛。 */
export const DEFAULT_THRESHOLDS = {
  performance: 0.9,
  accessibility: 0.95,
};

/**
 * 默认审计的路由：一个公开页 + 四个代表性业务页
 * （工作台、列表页、协同页、AI 页各取一条，覆盖不同的首屏权重）。
 */
export const DEFAULT_ROUTES = ["/login", "/dashboard", "/notes", "/docs", "/ai/chat"];

export function parseArgs(argv) {
  const urls = [];
  let enforce = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--budget") enforce = true;
    else if (arg === "--url") {
      const value = argv[index + 1];
      if (value) urls.push(value);
      index += 1;
    }
  }
  return { urls, enforce };
}

/**
 * 把 Playwright 的 storageState 转成 Cookie 请求头。
 *
 * 需要登录的路由靠这个走进工作台——Lighthouse 自己不会登录，
 * 而会话 Cookie 是 httpOnly，只能从 E2E 攒好的 state 里搬过来。
 */
export function cookieHeaderFromState(state, origin) {
  const host = (() => {
    try {
      return new URL(origin).hostname;
    } catch {
      return "";
    }
  })();

  const cookies = (state?.cookies ?? []).filter((cookie) => {
    if (!cookie?.name || typeof cookie.value !== "string") return false;
    const domain = (cookie.domain ?? "").replace(/^\./, "");
    return domain === "" || domain === host;
  });

  if (cookies.length === 0) return null;
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/** 逐项比对分数与门槛；分数缺失按 0 处理，避免「没跑出来」被当成通过。 */
export function evaluateScores(results, thresholds = DEFAULT_THRESHOLDS) {
  const checks = [];
  for (const result of results) {
    for (const [category, threshold] of Object.entries(thresholds)) {
      const score = result.scores?.[category] ?? 0;
      checks.push({
        url: result.url,
        category,
        score,
        threshold,
        pass: score >= threshold,
      });
    }
  }
  return { pass: checks.every((check) => check.pass), checks };
}

export function formatScore(score) {
  return Math.round(score * 100)
    .toString()
    .padStart(3);
}
