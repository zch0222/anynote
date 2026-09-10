"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useUIStore } from "@/stores/ui-store";
import { type ReactNode, useEffect } from "react";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { WorkspaceSession } from "./workspace-session";

export function AppShell({ children }: { children: ReactNode }) {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  useEffect(() => {
    void useUIStore.persist.rehydrate();
    return () => useUIStore.getState().setCommandPaletteOpen(false);
  }, []);
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <a
        href="#workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3"
      >
        跳转到内容
      </a>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader />
        <div id="workspace-content" tabIndex={-1} className="flex-1 p-5 outline-none sm:p-8">
          <WorkspaceSession>{children}</WorkspaceSession>
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
