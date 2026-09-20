"use client";

import { activeMobileTab, mobileTabs } from "@/components/layout/navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 底部 tab bar。
 *
 * 设计稿的形态是**悬浮胶囊**：整条 nav 是一条 350×64 的圆角浮岛（全圆），
 * 选中格自己再套一层 48 高的 accent 实心胶囊（图标 + 文字都变白）。
 * 这与"顶到屏幕边缘的平底栏"是两种语言，所以这里不改 `mobile.css` 的高度变量语义，
 * 只换视觉：`--mobile-tabbar-h` 仍然决定内容区要垫多高（浮岛 64 + 底部 8 让位），
 * 浮岛靠 `mx-auto max-w-[350px]` 居中，窄屏自然收窄。
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
      <ul className="mx-auto flex h-16 w-full max-w-[350px] items-stretch gap-1 rounded-full bg-surface p-2 shadow-popover">
        {mobileTabs.map((tab) => {
          const isActive = active?.href === tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                data-active={isActive ? "true" : "false"}
                className={cn(
                  // h-12：48 高的选中胶囊要装下图标 + 文字两行，也够 44 的触摸下限。
                  // 行高节奏必须自带：`text-[0.6875rem]` 是任意值字号、不配行高，标签会
                  // 继承 body 的 24px 行盒——11px 的字悬在行盒中部，图标被顶到胶囊上沿、
                  // 文字视觉下坠，整格上下失衡（设计稿 M-01 底栏：图标 22、行盒 13、
                  // 图标-文字 5，48 高内上下各 ≈4）。
                  "flex h-12 flex-col items-center justify-center gap-[5px] rounded-full text-[0.6875rem] outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-accent font-medium text-white"
                    : "text-label-secondary hover:bg-fill-hover",
                )}
              >
                <Icon className="size-[22px]" aria-hidden="true" />
                <span className="leading-[13px]">{tab.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
