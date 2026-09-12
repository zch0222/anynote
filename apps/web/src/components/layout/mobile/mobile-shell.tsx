"use client";

import { MobileTabBar } from "@/components/layout/mobile/mobile-tab-bar";
import { isImmersiveMobileRoute } from "@/components/layout/navigation";
import { WorkspaceSession } from "@/components/layout/workspace-session";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * 移动端外壳。
 *
 * 与桌面 `AppShell` 的区别：
 * - 不挂 `SidebarProvider` / `CommandPalette`（省首屏 JS，见方案 D8 的 250KB 分桶）
 * - 顶栏由各页面的 `MobileScreen` 提供（标题往往是数据，shell 猜不出来）
 * - 高度统一走 CSS 变量 `--mobile-content-h`，页面里不再各算 calc
 * - 沉浸式路由（编辑器 / 对话 / 阅读 / 搜索）隐藏 tab bar，判定是纯函数，可单测
 *
 * 会话引导复用桌面的 `WorkspaceSession`：加载骨架与 401 跳登录两条逻辑不重写。
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const immersive = isImmersiveMobileRoute(pathname);

  return (
    <div
      className="mobile-shell bg-background"
      data-testid="mobile-shell"
      data-immersive={immersive ? "true" : undefined}
    >
      <a
        href="#mobile-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3"
      >
        跳转到内容
      </a>
      <WorkspaceSession>{children}</WorkspaceSession>
      {immersive ? null : <MobileTabBar />}
    </div>
  );
}
