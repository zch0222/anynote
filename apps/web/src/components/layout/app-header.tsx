"use client";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useUIStore } from "@/stores/ui-store";
import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getWorkspaceRoute } from "./navigation";
import { ThemeSwitcher } from "./theme-switcher";
import { UserMenu } from "./user-menu";

export function AppHeader() {
  const pathname = usePathname();
  const route = getWorkspaceRoute(pathname);
  const setCommandPaletteOpen = useUIStore((state) => state.setCommandPaletteOpen);
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6">
      <SidebarTrigger aria-label="切换侧边栏" />
      <nav aria-label="面包屑" className="min-w-0 flex-1">
        <ol className="flex items-center gap-2 text-sm">
          <li className="hidden sm:block">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              工作空间
            </Link>
          </li>
          <li aria-hidden="true" className="hidden sm:block">
            <ChevronRight className="size-3 text-muted-foreground" />
          </li>
          {pathname.startsWith("/ai/") && (
            <li className="hidden text-muted-foreground sm:block">AI 助手 /</li>
          )}
          {pathname === "/notes/new" && (
            <li>
              <Link href="/notes" className="text-muted-foreground">
                笔记 /
              </Link>
            </li>
          )}
          <li aria-current="page" className="truncate font-medium">
            {route?.title || "工作空间"}
          </li>
        </ol>
      </nav>
      <Button
        variant="outline"
        size="sm"
        aria-label="打开命令面板"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setCommandPaletteOpen(true)}
      >
        <Search />
        <span className="hidden md:inline">搜索与快捷操作</span>
        <kbd className="hidden text-xs text-muted-foreground lg:inline">⌘ / Ctrl K</kbd>
      </Button>
      <ThemeSwitcher />
      <UserMenu />
    </header>
  );
}
