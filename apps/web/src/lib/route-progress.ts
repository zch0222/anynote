/**
 * 路由切换进度的判定逻辑（纯函数；监听与计时在 `hooks/use-route-progress.ts`）。
 *
 * 为什么需要这个：Next App Router 没有 router-events API，`loading.tsx`
 * 只覆盖**服务端段**的挂载等待，而客户端软导航（点击站内链接）从"点击"到
 * "新页面首帧"之间有一段没有任何反馈的空白。设计稿 P16 要求这一段有顶栏进度条。
 *
 * 判定抽成纯函数是因为它有**一堆容易漏的否定条件**——修饰键、中键、
 * 新标签页、下载、外站、锚点内跳。漏掉任何一条都会在用户"按住 ⌘ 点链接开新标签"
 * 时错误地亮起进度条，而且永远不会结束（当前页不会导航）。
 */

export type RouteProgressTarget = {
  /** 锚点的 `href` 属性原值（未解析）。 */
  href: string | null;
  /** 锚点的 `target` 属性。 */
  target: string | null;
  /** 锚点是否有 `download` 属性。 */
  hasDownload: boolean;
};

export type RouteProgressModifiers = {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  /** 鼠标按键：0 是左键。 */
  button: number;
};

/**
 * 这次点击会不会触发**站内软导航**。
 *
 * 判定里**刻意没有 `defaultPrevented`**：Next 的 `<Link>` 对站内软导航一定会调
 * `preventDefault()`（它要接管导航、阻止浏览器整页刷新），所以那个标志在这条
 * 最常见的路径上恒为 `true`。早期版本把它当作"别人抢走了这次点击"，
 * 结果是**进度条在真实点击下从不出现**——详见
 * `lib/__tests__/route-progress.test.ts` 里那条回归用例。
 *
 * 换句话说：在这个场景下 `preventDefault` 恰恰是"正在软导航"的**信号**，
 * 而不是放弃导航的信号。
 *
 * @param anchor 被点的锚点（已经从事件目标向上找到的最近 `<a>`）
 * @param modifiers 鼠标/键盘修饰状态
 * @param currentUrl 当前地址（用于排除外站、同页、纯 hash）
 */
export function isInternalNavigation(
  anchor: RouteProgressTarget,
  modifiers: RouteProgressModifiers,
  currentUrl: string,
): boolean {
  // 只有左键；修饰键点击一律是"开新标签页 / 新窗口 / 下载"，当前页不动
  if (modifiers.button !== 0) return false;
  if (modifiers.metaKey || modifiers.ctrlKey || modifiers.shiftKey || modifiers.altKey)
    return false;
  // 明确要求新上下文 / 下载
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasDownload) return false;
  if (!anchor.href) return false;

  let target: URL;
  let current: URL;
  try {
    current = new URL(currentUrl);
    target = new URL(anchor.href, current);
  } catch {
    // href 不是合法 URL（`javascript:` 之类）：当作非导航
    return false;
  }

  // 协议不同（mailto: / tel: / javascript:）由浏览器自己处理
  if (target.protocol !== current.protocol) return false;
  if (target.protocol !== "http:" && target.protocol !== "https:") return false;
  // 外站
  if (target.origin !== current.origin) return false;

  return isSameDocumentNavigation(current, target) === false;
}

/**
 * 同文档跳转（只改 hash、或地址完全没变）。
 *
 * 抽出来单独导出：它是上面那个判定的**唯一否定分支**，而"点锚点不该亮进度条"
 * 正是最容易写错的一处（`#section` 看起来像导航，其实不产生新页面）。
 */
export function isSameDocumentNavigation(current: URL, target: URL): boolean {
  return (
    current.origin === target.origin &&
    current.pathname === target.pathname &&
    current.search === target.search
  );
}

/**
 * 进度条在"没有任何后续信号"时的兜底收起时间。
 *
 * 必须有这个兜底：软导航若被浏览器中断（用户点完立刻按 ESC、或目标路由抛错），
 * 地址不变、pathname 的 effect 永远不触发，进度条就会一直挂在顶栏上。
 * 5s 足够长（真实导航都远快于此），也足够短到不会让人以为界面卡住。
 */
export const ROUTE_PROGRESS_TIMEOUT_MS = 5000;

/**
 * 进度条的**最短可见时长**。
 *
 * React 会把"点击时的 setState"与"导航带来的 pathname 更新"**批处理到同一次
 * 渲染**里，所以"地址变了"这个条件在第一次渲染时就已经成立——没有这一条，
 * 进度条只会闪一帧：`getAnimations()` 抓不到、截屏截不到、人眼也看不到。
 * （这是本文件对应 hook 上真实踩到的第二个坑，第一个是
 * `defaultPrevented`，两处都有回归用例。）
 *
 * 400ms 是"看得出发生过"与"不拖沓"之间的折中：它同时对应 `boot-bar`
 * 关键帧 400/3000 ≈ 13% 的位置，条子会推进到肉眼可见的一小段再收起。
 */
export const ROUTE_PROGRESS_MIN_VISIBLE_MS = 400;

/** 从事件目标向上找到最近的锚点；不在锚点内则返回 null。 */
export function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  let node = target as Node | null;
  while (node && node.nodeType !== 1) {
    node = node.parentNode;
  }
  while (node) {
    if (node.nodeType === 1 && (node as Element).tagName === "A") {
      return node as HTMLAnchorElement;
    }
    node = node.parentNode;
  }
  return null;
}
