/**
 * 移动端入口分流的纯逻辑（M10.1 / 方案 D2）。
 *
 * 这里**不 import 任何 Next 运行时**：middleware 与单测都直接调这些函数，
 * 判定规则只有一份。契约登记见 `.claude/openspec/changes/2026-09-12-mobile-route-segment.md`。
 */

/** 版式偏好 Cookie。只存版式选择，**不含任何身份信息**，因此可以是非 httpOnly。 */
export const VIEW_COOKIE = "anynote_view";

/** Cookie 有效期：一年。偏好属于长期设置，不该跟着会话过期。 */
export const VIEW_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type ViewPreference = "mobile" | "desktop";

/** 移动端落地页；UA 分流与"切换到手机版"都落到这里。 */
export const MOBILE_HOME = "/m/dashboard";

/**
 * 参与分流的入口路径。
 *
 * 只有这两条会被改写：深层路由（`/notes/3/7` 这类）通常来自分享链接或书签，
 * 跟着 UA 改写会让"同一个链接在不同设备上打开的不是同一个页面"，分享语义变坏。
 */
const ENTRY_PATHS = new Set(["/", "/dashboard"]);

/**
 * 是否判定为**手机** UA。
 *
 * 平板一律返回 false：决策 7 定的是平板落"桌面窄屏"形态，不做专门版式，
 * 因此它们不该被推进 `/m/*`。iPadOS 13+ 的 Safari 本来就报桌面 UA，这里额外把
 * 老 iPad 与 Android 平板（UA 里没有 `Mobile` 这个词）也排掉。
 */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return false;
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent);
  return /iPhone|iPod|Windows Phone|IEMobile|BlackBerry|BB10|webOS|Opera Mini|Mobi/i.test(
    userAgent,
  );
}

/** 解析偏好 Cookie；非法值按"没设置"处理，不猜。 */
export function parseViewPreference(value: string | null | undefined): ViewPreference | null {
  return value === "mobile" || value === "desktop" ? value : null;
}

/**
 * 逃生口：`?desktop=1` / `?mobile=1`。
 *
 * 它既让本次请求不被改写，也会被写进偏好 Cookie —— 用户点过一次"切换到桌面版"，
 * 下次再来就不该又被 UA 推走。
 */
export function readViewOverride(search: string): ViewPreference | null {
  const params = new URLSearchParams(search);
  if (params.get("desktop") === "1") return "desktop";
  if (params.get("mobile") === "1") return "mobile";
  return null;
}

export type ViewDecision = {
  /** 需要 307 过去的地址；null 表示留在当前路由。 */
  redirectTo: string | null;
  /** 需要写入的偏好 Cookie 值；null 表示不写（UA 判定不落库，它每次都能重新算）。 */
  setView: ViewPreference | null;
};

/**
 * 分流决策。优先级：逃生口 > 偏好 Cookie > UA。
 *
 * 非入口路径只处理逃生口（用于"切换到桌面版/手机版"链接把选择记下来），永不跳转。
 */
export function resolveViewDecision(input: {
  pathname: string;
  search: string;
  userAgent: string | null | undefined;
  viewCookie: string | null | undefined;
}): ViewDecision {
  const override = readViewOverride(input.search);

  if (!ENTRY_PATHS.has(input.pathname)) {
    return { redirectTo: null, setView: override };
  }

  const view =
    override ??
    parseViewPreference(input.viewCookie) ??
    (isMobileUserAgent(input.userAgent) ? "mobile" : "desktop");

  return { redirectTo: view === "mobile" ? MOBILE_HOME : null, setView: override };
}
