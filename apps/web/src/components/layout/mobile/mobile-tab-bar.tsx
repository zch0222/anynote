"use client";

import { activeMobileTab, mobileTabs } from "@/components/layout/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 底部 tab bar。
 *
 * 设计稿的形态是**悬浮胶囊**：整条 nav 是一条圆角浮岛，选中格自己再套一层
 * accent 实心胶囊（图标 + 文字都变白）。这与"顶到屏幕边缘的平底栏"是两种语言，
 * 所以这里不改 `mobile.css` 的高度变量，只换视觉：
 * `--mobile-tabbar-h` 仍然决定内容区要垫多高，浮岛靠 padding 从里面长出来。
 *
 * 4 格（工作台 / 知识库 / AI / 我的）：375px 下每格 88px，
 * 比 5 格时宽出 20%，图标与文字都不再挤。
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const active = activeMobileTab(pathname);

  return (
    <nav
      aria-label="主导航"
      data-testid="mobile-tab-bar"
      className="mobile-tab-bar fixed inset-x-0 bottom-0 z-30 px-3"
    >
      <ul className="flex items-stretch gap-1 rounded-2xl bg-surface p-1 shadow-popover">
        {mobileTabs.map((tab) => {
          const isActive = active?.href === tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                data-active={isActive ? "true" : "false"}
                className={cn(
                  // min-h-12：44px 是可点的下限，选中胶囊要装下图标 + 文字两行
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem] outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-accent font-medium text-white"
                    : "text-label-secondary hover:bg-grouped",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span>{tab.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
