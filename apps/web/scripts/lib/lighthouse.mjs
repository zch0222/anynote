// Lighthouse 跑分的纯逻辑（参数解析、Cookie 组装、阈值判定）。
// lighthouse.mjs 负责起浏览器与读文件，这里只负责算，便于单测。

/** M8.3 质量门槛（桌面口径）。 */
export const DEFAULT_THRESHOLDS = {
  performance: 0.9,
  accessibility: 0.95,
};

/**
 * M10.0 移动端门槛。Performance 比桌面低 5 个点是**口径差异不是放水**：
 * Lighthouse 移动预设自带 4× CPU 降速与 150ms RTT 节流，同一份产物量出来必然更低，
 * 沿用 0.9 会在「性能没有退化」时红灯。Accessibility 与桌面同标准，不降。
 */
export const MOBILE_THRESHOLDS = {
  performance: 0.85,
  accessibility: 0.95,
};

/**
 * 默认审计的路由：一个公开页 + 四个代表性业务页
 * （工作台、列表页、协同页、AI 页各取一条，覆盖不同的首屏权重）。
 */
export const DEFAULT_ROUTES = ["/login", "/dashboard", "/notes", "/docs", "/ai/chat"];

/** 移动端默认路由：同样的取样口径，换成 `/m/*` 的对应页。 */
export const MOBILE_ROUTES = ["/login", "/m/dashboard", "/m/notes", "/m/docs", "/m/ai/chat"];

export function parseArgs(argv) {
  const urls = [];
  let enforce = false;
  let mobile = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--budget") enforce = true;
    else if (arg === "--mobile") mobile = true;
    else if (arg === "--url") {
      const value = argv[index + 1];
      if (value) urls.push(value);
      index += 1;
    }
  }
  return { urls, enforce, mobile };
}

/**
 * 一次运行的口径：桌面还是移动。
 *
 * 移动端**不加载** `desktop-config`——Lighthouse 默认就是移动 form factor 加对应节流，
 * 混用会量出「移动页面跑在桌面网络上」的假高分。
 */
export function selectProfile(mobile) {
  return mobile
    ? {
        name: "mobile",
        thresholds: MOBILE_THRESHOLDS,
        routes: MOBILE_ROUTES,
        useDesktopConfig: false,
      }
    : {
        name: "desktop",
        thresholds: DEFAULT_THRESHOLDS,
        routes: DEFAULT_ROUTES,
        useDesktopConfig: true,
      };
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
