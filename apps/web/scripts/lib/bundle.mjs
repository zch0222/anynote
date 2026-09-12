// 产物体积统计与预算判定的纯逻辑。与文件系统解耦，便于单测
// （bundle-report.mjs 负责读盘，这里只负责算）。

/** M8.3 性能预算（gzip 字节）。 */
export const DEFAULT_BUDGETS = {
  /** 单条路由首屏加载的全部 JS。 */
  initialJs: 300 * 1024,
  /**
   * 移动端路由（`/m/*`）首屏 JS。比桌面紧 50KB：移动端外壳不挂 sidebar / cmdk /
   * react-table / xyflow，省下来的额度要守住，不能让它慢慢退化成桌面口径（M10.0 D8）。
   */
  mobileInitialJs: 250 * 1024,
  /** 编辑器整包（TipTap + 自定义扩展 + 桥接）。 */
  editorChunk: 250 * 1024,
};

/**
 * 是否是移动端路由。
 *
 * 必须按**路径段**判断：`startsWith("/m")` 会把 `/mooc`、`/me` 这类桌面路由
 * 误判进移动端桶，用更紧的预算去卡它们，报出与事实不符的红灯。
 */
export function isMobileRoute(route) {
  return route === "/m" || route.startsWith("/m/");
}

/** 把路由按预算桶分组，返回各桶里最重的一条（没有则为 null）。 */
export function heaviestByBucket(routes) {
  const pick = (list) => list.reduce((max, row) => (max && max.gzip >= row.gzip ? max : row), null);
  return {
    desktop: pick(routes.filter((row) => !isMobileRoute(row.route))),
    mobile: pick(routes.filter((row) => isMobileRoute(row.route))),
  };
}

/** 判定 chunk 归属用的标志字符串。 */
export const MARKERS = {
  编辑器: ["anynote-slash-menu", "anynote-code-block", "anynote-toolbar"],
  KaTeX: ["katex-display", "KaTeX_Main"],
  Shiki: ["ShikiError", "createHighlighterCore", "shiki"],
  ProseMirror: ["prosemirror", "ProseMirror", "Schema("],
  markdown: ["markdown-it", "MarkdownSerializerState", "markdownit"],
  协同: ["y-websocket", "CollaborationCaret", "collaboration-carets"],
};

export function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** 按标志字符串判断一个 chunk 里包含哪些子系统。 */
export function classifyChunk(text, markers = MARKERS) {
  return Object.entries(markers)
    .filter(([, needles]) => needles.some((needle) => text.includes(needle)))
    .map(([name]) => name);
}

/**
 * 把 app-build-manifest 的页面 key 还原成用户可见路由。
 * Next 的 key 形如 `/(workspace)/docs/page`：路由组不出现在 URL 里。
 */
export function toRoutePath(pageKey) {
  const path = pageKey
    .replace(/\/page$/, "")
    .replace(/\/\([^/]+\)/g, "")
    .replace(/\/route$/, "");
  return path === "" ? "/" : path;
}

/**
 * 某个页面 key 会套用的全部祖先 layout key（含根 layout）。
 *
 * manifest 把 layout 与 page 分开列，页面条目里并不包含 layout 的 chunk，
 * 但用户打开这条路由时两边都要下载——不合并会系统性低估首屏体积。
 */
export function ancestorLayouts(pageKey, layoutKeys) {
  const dir = pageKey.replace(/\/page$/, "");
  return layoutKeys.filter((layoutKey) => {
    const layoutDir = layoutKey.replace(/\/layout$/, "");
    return layoutDir === dir || dir.startsWith(`${layoutDir}/`);
  });
}

/**
 * 统计每条路由的首屏 JS 体积 = 页面自身 chunk ∪ 各级 layout chunk，去重后求和。
 *
 * `sizes` 是「manifest 里的文件路径 → gzip 字节」的映射。
 */
export function summarizeRoutes(manifest, sizes) {
  const pages = manifest.pages ?? {};
  const keys = Object.keys(pages).filter((key) => !key.includes("/api/"));
  const layoutKeys = keys.filter((key) => key.endsWith("/layout") || key === "/layout");

  const routes = [];
  for (const pageKey of keys) {
    // layout / template 自身不是可访问路由，只作为页面的组成部分参与统计
    if (layoutKeys.includes(pageKey)) continue;
    const files = new Set(pages[pageKey] ?? []);
    for (const layoutKey of ancestorLayouts(pageKey, layoutKeys)) {
      for (const file of pages[layoutKey] ?? []) files.add(file);
    }
    const unique = [...files];
    const gzip = unique.reduce((sum, file) => sum + (sizes[file] ?? 0), 0);
    routes.push({ route: toRoutePath(pageKey), files: unique, gzip });
  }
  return routes.sort((a, b) => b.gzip - a.gzip);
}

/** 编辑器相关 chunk 的 gzip 合计（同一 chunk 只算一次）。 */
export function sumEditorChunks(rows) {
  return rows.filter((row) => row.hits.includes("编辑器")).reduce((sum, row) => sum + row.gzip, 0);
}

/**
 * 逐项判定预算。返回 checks 而不是直接抛错，
 * 让调用方能把全部结果打印出来再决定退出码。
 */
export function evaluateBudgets(actuals, budgets = DEFAULT_BUDGETS) {
  const checks = [
    {
      name: "单条路由首屏 JS（gzip）",
      detail: actuals.heaviestRoute ?? "",
      actual: actuals.initialJs,
      budget: budgets.initialJs,
    },
    // 移动端路由还不存在时（M10.1 之前）没有可判定对象，整条检查跳过而不是记 0 分通过
    ...(actuals.mobileInitialJs === undefined
      ? []
      : [
          {
            name: "移动端路由首屏 JS（gzip）",
            detail: actuals.heaviestMobileRoute ?? "",
            actual: actuals.mobileInitialJs,
            budget: budgets.mobileInitialJs,
          },
        ]),
    {
      name: "编辑器 chunk 合计（gzip）",
      detail: "",
      actual: actuals.editorChunk,
      budget: budgets.editorChunk,
    },
  ].map((check) => ({ ...check, pass: check.actual <= check.budget }));

  return { pass: checks.every((check) => check.pass), checks };
}
