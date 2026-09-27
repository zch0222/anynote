"use client";

import {
  clearLeaveConfirmed,
  leaveRecentlyConfirmed,
  markLeaveConfirmed,
} from "@/features/notes/leave-confirmation";
import { useEffect } from "react";

/**
 * 有未同步改动时拦截离开：关页与刷新走浏览器的 `beforeunload` 确认，
 * 站内链接跳转在捕获阶段弹确认框，取消即阻止这次跳转。
 *
 * @param active 是否需要拦截
 * @param message 站内跳转确认框的文案（`beforeunload` 的文案由浏览器决定）
 */
export function useLeaveGuard(active: boolean, message: string): void {
  // 编辑页卸载（站内跳转已完成）后清掉确认记录，回到页面时重新拦截
  useEffect(() => clearLeaveConfirmed, []);

  useEffect(() => {
    if (!active) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // 站内刚确认过离开、跳转退化成整页加载时，不再弹第二次确认
      if (leaveRecentlyConfirmed()) return;
      event.preventDefault();
      event.returnValue = message;
    };

    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href, window.location.href);
      // 站外链接会触发 beforeunload，由浏览器确认
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      markLeaveConfirmed();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [active, message]);
}
