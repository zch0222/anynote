"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUIStore } from "@/stores/ui-store";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { isFullBleedRoute } from "./navigation";
import { RouteProgressBar } from "./route-progress-bar";
import { WorkspaceSession } from "./workspace-session";

/**
 * 桌面工作区外壳。
 *
 * 侧栏的折叠状态**只在桌面端**绑定 Zustand：移动端 `SidebarProvider` 自己管
 * 抽屉的开合，若也被 store 接管，第一次点开抽屉就会把桌面偏好写成 true，
 * 回到桌面发现侧栏莫名展开了。
 *
 * 内容区的内边距分两种形态（见 `isFullBleedRoute`）：文档流页面留白，
 * 编辑器类页面满幅——后者的顶栏分隔线与正文底色要一直铺到窗口右缘。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const fullBleed = isFullBleedRoute(pathname);
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);

  useEffect(() => {
    void useUIStore.persist.rehydrate();
    return () => useUIStore.getState().setCommandPaletteOpen(false);
  }, []);

  return (
    <SidebarProvider {...(isMobile ? {} : { open: sidebarOpen, onOpenChange: setSidebarOpen })}>
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:p-3"
      >
        跳转到内容
      </a>
      <AppSidebar />
      {/*
        满幅页面的内容列必须是 `flex flex-col` + `min-h-0` 的确定高度链：
        页面自己用 flex-1 吃满剩余高度、内部滚动，而不是靠 `100svh - 固定值`
        去猜页头与内边距加起来多高。后者一旦页头高度变了就会露出底色。
      */}
      {/*
        满幅页面的高度必须**确定**，否则内部滚不起来。
        `SidebarProvider` 的 wrapper 只是 `min-h-svh`（高度由内容决定），
        一路 `flex-1` 下去拿到的都是"内容多高就多高"，长文会把整页顶长、
        `note-scroll` 永远不产生内部滚动条。所以这里给整列一个确定高度 +
        `overflow-hidden`，把剩余高度切出来交给页面自己分配。

        非满幅页面保持原样：它们的文档流本来就应该随内容变长、由整页滚动。
      */}
      <SidebarInset
        className={fullBleed ? "h-svh min-w-0 overflow-hidden bg-surface" : "min-w-0 bg-grouped"}
      >
        <AppHeader />
        {/*
          路由进度条紧跟顶栏：`sticky top-14` 与顶栏的 `min-h-14` 对齐，
          长页面滚动时它随顶栏一起留在视口顶部，不会滑出视野。
        */}
        <RouteProgressBar />
        <div
          id="workspace-content"
          tabIndex={-1}
          className={
            fullBleed
              ? "flex min-h-0 flex-1 flex-col outline-none"
              : "flex-1 px-5 pb-5 outline-none sm:px-8"
          }
        >
          <WorkspaceSession>{children}</WorkspaceSession>
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
