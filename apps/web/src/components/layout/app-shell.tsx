"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUIStore } from "@/stores/ui-store";
import { type ReactNode, useEffect } from "react";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { WorkspaceSession } from "./workspace-session";

/**
 * 桌面工作区外壳。
 *
 * 侧栏的折叠状态**只在桌面端**绑定 Zustand：移动端 `SidebarProvider` 自己管
 * 抽屉的开合，若也被 store 接管，第一次点开抽屉就会把桌面偏好写成 true，
 * 回到桌面发现侧栏莫名展开了。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
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
      <SidebarInset className="min-w-0 bg-grouped">
        <AppHeader />
        <div id="workspace-content" tabIndex={-1} className="flex-1 px-5 pb-5 outline-none sm:px-8">
          <WorkspaceSession>{children}</WorkspaceSession>
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
