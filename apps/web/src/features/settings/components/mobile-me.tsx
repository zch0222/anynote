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
        <section className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card">
          <Avatar className="size-12">
            <AvatarImage src={me.data?.avatar || undefined} alt="" />
            <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-headline font-semibold text-label">{name}</p>
            {/* /api/auth/me 的白名单里没有邮箱，这里只展示它确实返回的字段 */}
            <p className="truncate text-footnote text-label-secondary">
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
              icon={<route.icon className="size-4 text-label-secondary" aria-hidden="true" />}
            />
          ))}
        </MeGroup>

        {/* 画布不做移动端，给说明 + 桌面版链接，而不是让入口消失得没有解释 */}
        <MeGroup label="仅桌面版">
          {mobileUnavailableRoutes.map((route) => (
            <li key={route.desktopHref}>
              <Link href={`${route.desktopHref}?desktop=1`} prefetch={false} className={ROW_CLASS}>
                <route.icon className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-footnote text-label">{route.title}</span>
                  <span className="block truncate text-xs text-label-tertiary">{route.reason}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </MeGroup>

        <div className="space-y-2">
          <ViewSwitch className="w-full justify-start rounded-lg bg-surface px-4 py-3 text-footnote shadow-card" />
          <button
            type="button"
            disabled={logout.isPending}
            data-testid="mobile-logout"
            onClick={() =>
              logout.mutate(undefined, { onError: () => toast.error("退出登录失败，请重试") })
            }
            className="flex min-h-12 w-full items-center gap-2 rounded-lg bg-surface px-4 text-footnote text-danger shadow-card outline-none transition-colors hover:bg-danger/5 disabled:opacity-50"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {logout.isPending ? "正在退出…" : "退出登录"}
          </button>
        </div>
      </div>
    </MobileScreen>
  );
}

const ROW_CLASS =
  "flex min-h-14 items-center gap-3 px-4 py-2 outline-none transition-colors focus-visible:bg-grouped";

function MeGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium text-label-tertiary">{label}</h2>
      <ul className="divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-card">
        {children}
      </ul>
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
  description?: string | undefined;
  icon?: ReactNode | undefined;
  testId?: string | undefined;
}) {
  return (
    <li>
      <Link href={href} data-testid={testId} className={ROW_CLASS}>
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-footnote text-label">{title}</span>
          {description ? (
            <span className="block truncate text-xs text-label-tertiary">{description}</span>
          ) : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
      </Link>
    </li>
  );
}
