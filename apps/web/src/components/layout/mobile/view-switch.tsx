"use client";

import { toDesktopHref, toMobileHref } from "@/components/layout/navigation";
import { cn } from "@/lib/utils";
import { Monitor, Smartphone } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 桌面 ⇄ 移动版互切（方案 D2）。
 *
 * 链接上带 `?desktop=1` / `?mobile=1`：middleware 会把它写进 `anynote_view` 偏好，
 * 用户点过一次之后就不会再被 UA 判定推走——否则"切到桌面版"下次进来又被弹回移动版。
 */
export function ViewSwitch({ className }: { className?: string }) {
  const pathname = usePathname();
  const isMobileView = pathname === "/m" || pathname.startsWith("/m/");

  const href = isMobileView
    ? `${toDesktopHref(pathname)}?desktop=1`
    : `${toMobileHref(pathname) ?? "/m/dashboard"}?mobile=1`;

  const Icon = isMobileView ? Monitor : Smartphone;
  const label = isMobileView ? "切换到桌面版" : "切换到手机版";

  return (
    <Link
      href={href}
      prefetch={false}
      data-testid="view-switch"
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
