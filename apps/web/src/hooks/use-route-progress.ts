"use client";

import {
  ROUTE_PROGRESS_MIN_VISIBLE_MS,
  ROUTE_PROGRESS_TIMEOUT_MS,
  findAnchor,
  isInternalNavigation,
} from "@/lib/route-progress";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 站内软导航的顶栏进度条（设计稿 P16「路由切换 · 移动端顶栏进度条」）。
 *
 * 为什么需要它：Next App Router 没有 router-events API，`loading.tsx` 只覆盖
 * **服务端段**的挂载等待。客户端软导航从"点击链接"到"新页面首帧"之间有一段
 * 没有任何反馈的空白。
 *
 * 收尾靠两条信号，缺一不可：
 * 1. **`pathname` 变化**（正常路径）——新页面已经挂上
 * 2. **`ROUTE_PROGRESS_TIMEOUT_MS` 兜底**（异常路径）——导航被中断 / 抛错时
 *    地址不变，只靠 ① 进度条会永远挂在顶栏上
 *
 * 还有一条容易被忽略的：**最短可见时长**。React 会把"点击时的 setState"与
 * "导航带来的 pathname 更新"**批处理到同一次渲染**里，于是"地址变了"
 * 这个条件在第一次渲染时就已经成立——进度条只会闪一帧，肉眼看不到、
 * 测试也抓不到。让它在最短时长内留在屏幕上，才是它该有的行为。
 *
 * 判定逻辑在 `lib/route-progress.ts`（纯函数，可单测）；这里只做监听与计时。
 */
export function useRouteProgress(): boolean {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  /** 点击发生时的地址。导航把它变掉，我们就知道"到了"。 */
  const fromPathRef = useRef<string | null>(null);
  /** 本次导航最早可以收起的时刻（保证最短可见时长）。 */
  const holdUntilRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    for (const ref of [timeoutRef, holdRef]) {
      if (ref.current !== null) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    fromPathRef.current = null;
    setPending(false);
  }, [clearTimers]);

  /*
   * 导航完成：地址已经不是出发时那个了。
   *
   * 这条 effect **真的读 `pathname`**（不是把它当触发信号），所以依赖是完整的。
   * 最短可见时长由 `holdUntilRef` 决定：还没到点就先挂一个补收的定时器。
   */
  useEffect(() => {
    if (fromPathRef.current === null || fromPathRef.current === pathname) return;
    const remaining = holdUntilRef.current - Date.now();
    if (remaining <= 0) {
      stop();
      return;
    }
    if (holdRef.current === null) {
      holdRef.current = setTimeout(stop, remaining);
    }
  }, [pathname, stop]);

  useEffect(() => {
    /*
     * 挂在 `document` 的**冒泡**阶段（React 18 把事件监听器挂在 root container
     * `<body>` 内，document 在它之上，所以到这里时业务 onClick 都跑完了）。
     *
     * 注意**不读 `event.defaultPrevented`**：Next 的 `<Link>` 对站内导航一定会
     * `preventDefault()`，那个标志在这条路径上恒为 true。详见 `lib/route-progress.ts`
     * 顶部的说明与同名回归用例。
     */
    const onClick = (event: MouseEvent) => {
      const anchor = findAnchor(event.target);
      if (!anchor) return;
      if (
        !isInternalNavigation(
          {
            href: anchor.getAttribute("href"),
            target: anchor.getAttribute("target"),
            hasDownload: anchor.hasAttribute("download"),
          },
          {
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            shiftKey: event.shiftKey,
            altKey: event.altKey,
            button: event.button,
          },
          window.location.href,
        )
      ) {
        return;
      }

      clearTimers();
      fromPathRef.current = window.location.pathname;
      holdUntilRef.current = Date.now() + ROUTE_PROGRESS_MIN_VISIBLE_MS;
      setPending(true);
      // 兜底：导航被中断时地址不变，"地址变了"这个信号永远等不到
      timeoutRef.current = setTimeout(stop, ROUTE_PROGRESS_TIMEOUT_MS);
    };

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimers();
    };
  }, [clearTimers, stop]);

  return pending;
}
