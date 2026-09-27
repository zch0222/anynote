"use client";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const SHORTCUT = "Meta+B Control+B";

/**
 * 「展开侧边栏」。
 *
 * 桌面端只在侧栏收起时出现；窄屏（抽屉形态）始终出现，点它打开抽屉。
 * 显隐用 `md:hidden` 而不是 `useIsMobile`：后者首帧恒为 false，
 * 窄屏下服务端渲染的那一帧会把按钮藏起来。
 */
export function SidebarExpandButton({ className }: { className?: string }) {
  const { state, toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="展开侧边栏"
      aria-keyshortcuts={SHORTCUT}
      title="展开侧边栏（⌘B）"
      data-testid="sidebar-expand"
      onClick={toggleSidebar}
      className={cn("shrink-0", state === "expanded" && "md:hidden", className)}
    >
      <PanelLeftOpen aria-hidden="true" />
    </Button>
  );
}

/** 「收起侧边栏」：侧栏头部右端。抽屉形态下它关上抽屉，不改桌面偏好。 */
export function SidebarCollapseButton() {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="收起侧边栏"
      aria-keyshortcuts={SHORTCUT}
      title="收起侧边栏（⌘B）"
      data-testid="sidebar-collapse"
      onClick={toggleSidebar}
      className="shrink-0 text-label-tertiary hover:text-label"
    >
      <PanelLeftClose aria-hidden="true" />
    </Button>
  );
}
