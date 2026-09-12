"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ViewSwitch } from "@/components/layout/mobile/view-switch";
import { mobileMoreRoutes, mobileUnavailableRoutes } from "@/components/layout/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLogoutMutation } from "@/features/auth/use-logout-mutation";
import { useMe } from "@/features/auth/use-me";
import { SETTINGS_SECTIONS } from "@/features/settings/components/account-settings";
import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { toast } from "sonner";

/**
 * `/m/me`：移动端的"我的"。
 *
 * 桌面把设置摊成横向分区 tabs、把更多入口塞进侧边栏；移动端收敛成一列分组列表——
 * 这里同时承担三件事：设置入口、tab 放不下的页面入口、版式互切与退出登录。
 */
export function MobileMePage() {
  const me = useMe();
  const logout = useLogoutMutation();
  const name = me.data?.nickname || me.data?.username || "我的账户";

  return (
    <MobileScreen title="我的">
      <div className="space-y-6 p-4" data-testid="mobile-me">
        <section className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Avatar>
            <AvatarImage src={me.data?.avatar || undefined} alt="" />
            <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{name}</p>
            {/* /api/auth/me 的白名单里没有邮箱，这里只展示它确实返回的字段 */}
            <p className="truncate text-sm text-muted-foreground">
              {me.data?.username ? `@${me.data.username}` : "账号资料加载中"}
            </p>
          </div>
        </section>

        <MeGroup label="设置">
          {SETTINGS_SECTIONS.map((section) => (
            <MeLink
              key={section.key}
              href={`/m/settings/${section.key}`}
              title={section.label}
              testId={`me-settings-${section.key}`}
            />
          ))}
        </MeGroup>

        <MeGroup label="更多">
          {mobileMoreRoutes.map((route) => (
            <MeLink
              key={route.href}
              href={route.href}
              title={route.title}
              description={route.description}
              icon={<route.icon className="size-4 text-muted-foreground" aria-hidden="true" />}
            />
          ))}
        </MeGroup>

        {/* 决策 4：画布不做移动端，给说明 + 桌面版链接，而不是让入口消失得没有解释 */}
        <MeGroup label="仅桌面版">
          {mobileUnavailableRoutes.map((route) => (
            <li key={route.desktopHref}>
              <Link
                href={`${route.desktopHref}?desktop=1`}
                prefetch={false}
                className="flex min-h-14 items-center gap-3 px-4 py-2 text-sm outline-none focus-visible:bg-accent"
              >
                <route.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{route.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {route.reason}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </MeGroup>

        <div className="space-y-2">
          <ViewSwitch className="w-full justify-start rounded-xl border bg-card px-4 py-3" />
          <button
            type="button"
            disabled={logout.isPending}
            data-testid="mobile-logout"
            onClick={() =>
              logout.mutate(undefined, { onError: () => toast.error("退出登录失败，请重试") })
            }
            className="flex min-h-12 w-full items-center gap-2 rounded-xl border bg-card px-4 text-sm text-destructive outline-none transition-colors hover:bg-accent disabled:opacity-50"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {logout.isPending ? "正在退出…" : "退出登录"}
          </button>
        </div>
      </div>
    </MobileScreen>
  );
}

function MeGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">{children}</ul>
    </section>
  );
}

function MeLink({
  href,
  title,
  description,
  icon,
  testId,
}: {
  href: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  testId?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        data-testid={testId}
        className="flex min-h-14 items-center gap-3 px-4 py-2 text-sm outline-none focus-visible:bg-accent"
      >
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{title}</span>
          {description ? (
            <span className="block truncate text-xs text-muted-foreground">{description}</span>
          ) : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
