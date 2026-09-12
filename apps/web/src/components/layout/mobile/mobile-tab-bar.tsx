"use client";

import { activeMobileTab, mobileTabs } from "@/components/layout/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 底部 tab bar（方案 D3）。
 *
 * 固定在视口底部而不是跟着文档流：内容区滚动时它必须一直在，
 * 高度与安全区由 `.mobile-tab-bar` 统一管（见 styles/mobile.css）。
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const active = activeMobileTab(pathname);

  return (
    <nav
      aria-label="主导航"
      data-testid="mobile-tab-bar"
      className="mobile-tab-bar fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t bg-background"
    >
      {mobileTabs.map((tab) => {
        const isActive = active?.href === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive ? "true" : "false"}
            className={cn(
              // min-h-11：44px 是可点的下限，比 tab 本身的高度更重要
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] outline-none transition-colors",
              "focus-visible:bg-accent/60",
              isActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span>{tab.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}
