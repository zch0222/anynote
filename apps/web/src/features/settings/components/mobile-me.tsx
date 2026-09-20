"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ViewSwitch } from "@/components/layout/mobile/view-switch";
import { mobileMoreRoutes, mobileUnavailableRoutes } from "@/components/layout/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLogoutMutation } from "@/features/auth/use-logout-mutation";
import { useMe } from "@/features/auth/use-me";
import {
  MOBILE_SETTINGS_SECTIONS,
  type MobileSettingsSection,
} from "@/features/settings/components/mobile/settings-sections";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  CircleUser,
  LogOut,
  type LucideIcon,
  Palette,
  Plug,
  Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

/**
 * M-02 图例 5–8：设置四行各带一个 28 的**彩色图标块**（iOS 设置的语言），
 * 颜色按画板取系统色板，白色图标坐在上面。缺了它整组行就是一片灰字。
 */
const SECTION_ICON_BLOCKS: Record<MobileSettingsSection, { icon: LucideIcon; tone: string }> = {
  profile: { icon: CircleUser, tone: "bg-[#0a84ff]" },
  appearance: { icon: Palette, tone: "bg-[#5e5ce6]" },
  ai: { icon: Sparkles, tone: "bg-[#ff9f0a]" },
  integrations: { icon: Plug, tone: "bg-[#30d158]" },
};

const THEME_VALUE_LABEL: Record<string, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

/**
 * `/m/me`：移动端的"我的"。
 *
 * 桌面把设置摊成横向分区 tabs、把更多入口塞进侧边栏；移动端收敛成一列分组列表——
 * 这里同时承担三件事：设置入口、tab 放不下的页面入口、版式互切与退出登录。
 */
export function MobileMePage() {
  const me = useMe();
  const logout = useLogoutMutation();
  const { theme } = useTheme();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const name = me.data?.nickname || me.data?.username || "我的账户";

  return (
    <MobileScreen title="我的">
      <div className="space-y-6 p-4" data-testid="mobile-me">
        {/*
          资料卡整卡可点（M-02 图例 2，原先行不可点）。卡片本身就是"去改资料"
          最自然的落点，比在卡里再塞一个"编辑"按钮少一次点击。
        */}
        <Link
          href="/m/settings/profile"
          data-testid="me-profile-card"
          className="flex min-h-[76px] items-center gap-3 rounded-lg bg-surface p-4 shadow-card outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        >
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
          <ChevronRight className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
        </Link>

        <MeGroup label="设置">
          {MOBILE_SETTINGS_SECTIONS.map((section) => {
            const block = SECTION_ICON_BLOCKS[section.key];
            return (
              <MeLink
                key={section.key}
                href={`/m/settings/${section.key}`}
                title={section.label}
                testId={`me-settings-${section.key}`}
                iconBlock={block}
                /*
                 * M-02 / V07：外观行右侧要写当前值（跟随系统 / 浅色 / 深色），
                 * 否则进设置页之前看不出现在是什么主题。
                 */
                value={
                  section.key === "appearance" && theme
                    ? (THEME_VALUE_LABEL[theme] ?? theme)
                    : undefined
                }
              />
            );
          })}
        </MeGroup>

        <MeGroup label="更多">
          {mobileMoreRoutes.map((route, index) => (
            <MeLink
              key={route.href}
              href={route.href}
              title={route.title}
              description={route.description}
              iconBlock={{
                icon: route.icon,
                tone: index === 0 ? "bg-[#5ac8fa]" : "bg-[#bf5af2]",
              }}
            />
          ))}
        </MeGroup>

        {/* 画布不做移动端，给说明 + 桌面版链接，而不是让入口消失得没有解释 */}
        <MeGroup label="仅桌面版">
          {mobileUnavailableRoutes.map((route) => (
            <MeLink
              key={route.desktopHref}
              href={`${route.desktopHref}?desktop=1`}
              title={route.title}
              description={route.reason}
              iconBlock={{ icon: route.icon, tone: "bg-[#8e8e93]" }}
              external
            />
          ))}
        </MeGroup>

        <div className="space-y-2">
          <ViewSwitch className="w-full justify-start rounded-lg bg-surface px-4 py-3 text-footnote shadow-card" />
          {/*
            退出登录先弹动作表确认（M-02 图例 15，原实现一点就走）。
            退出会丢掉当前编辑页未保存的内容，且重新登录要再输一次密码——
            这是"代价明显高于误触成本"的操作，必须挡一道。
          */}
          <button
            type="button"
            disabled={logout.isPending}
            data-testid="mobile-logout"
            onClick={() => setConfirmingLogout(true)}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-surface px-4 text-footnote font-medium text-danger shadow-card outline-none transition-colors hover:bg-danger/5 disabled:opacity-50"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {logout.isPending ? "正在退出…" : "退出登录"}
          </button>
        </div>
      </div>

      {confirmingLogout ? (
        <MobileActionSheet
          open
          onOpenChange={(next) => {
            if (!next) setConfirmingLogout(false);
          }}
          title="退出登录？"
          description="退出后需要重新输入账号密码，未保存的内容会丢失。"
          actions={[
            {
              label: "退出登录",
              icon: LogOut,
              destructive: true,
              onSelect: () => {
                setConfirmingLogout(false);
                logout.mutate(undefined, { onError: () => toast.error("退出登录失败，请重试") });
              },
            },
          ]}
        />
      ) : null}
    </MobileScreen>
  );
}

const ROW_CLASS =
  "flex min-h-[52px] items-center gap-3 px-4 py-2 outline-none transition-colors focus-visible:bg-fill-hover";

function MeGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-footnote font-medium text-label-secondary">{label}</h2>
      <ul
        className={cn(
          "divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-card",
        )}
      >
        {children}
      </ul>
    </section>
  );
}

function MeLink({
  href,
  title,
  description,
  iconBlock,
  value,
  external,
  testId,
}: {
  href: string;
  title: string;
  description?: string | undefined;
  /** 28 的彩色图标块（M-02 图例 5–8）；不给就退化成纯文字行。 */
  iconBlock?: { icon: LucideIcon; tone: string } | undefined;
  /** 行右侧的当前值（外观行写当前主题），在 chevron 左边。 */
  value?: string | undefined;
  external?: boolean | undefined;
  testId?: string | undefined;
}) {
  const Icon = iconBlock?.icon;
  return (
    <li>
      <Link
        href={href}
        data-testid={testId}
        {...(external ? { prefetch: false } : {})}
        className={ROW_CLASS}
      >
        {Icon ? (
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-[7px] text-white",
              iconBlock?.tone,
            )}
            aria-hidden="true"
          >
            <Icon className="size-4" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-footnote text-label">{title}</span>
          {description ? (
            <span className="block truncate text-xs text-label-tertiary">{description}</span>
          ) : null}
        </span>
        {value ? <span className="shrink-0 text-footnote text-label-tertiary">{value}</span> : null}
        <ChevronRight className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
      </Link>
    </li>
  );
}
