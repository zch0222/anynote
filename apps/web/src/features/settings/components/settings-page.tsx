"use client";

import { PanelSkeleton } from "@/components/loading/skeletons";
import { SETTINGS_SECTIONS, type SettingsSection } from "@/features/settings/sections";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import Link from "next/link";

/*
 * 四个分区分开按需加载。
 *
 * 它们同属一页的四面，但只有一面会渲染。静态引入会把另外三面的依赖也压进首屏——
 * 「账号」那条尤其贵（react-hook-form + 表单原子），而它恰好是**唯一**被
 * `/settings/profile` 之外的路径访问不到的分区。这也符合仓库对重依赖一律
 * `dynamic(..., { ssr: false })` 的约束。
 */
const AccountSettings = dynamic(
  () => import("./account-settings").then((mod) => mod.AccountSettings),
  { ssr: false, loading: () => <SettingsSectionSkeleton /> },
);
const AppearanceSettings = dynamic(
  () => import("./appearance-settings").then((mod) => mod.AppearanceSettings),
  { ssr: false, loading: () => <SettingsSectionSkeleton /> },
);
const AiSettings = dynamic(() => import("./ai-settings").then((mod) => mod.AiSettings), {
  ssr: false,
  loading: () => <SettingsSectionSkeleton />,
});
const IntegrationsSettings = dynamic(
  () => import("./integrations-settings").then((mod) => mod.IntegrationsSettings),
  { ssr: false, loading: () => <SettingsSectionSkeleton /> },
);

/** 分区块的骨架：形状对齐设置卡（标题 + 若干行），避免加载完成时整页跳一下。 */
function SettingsSectionSkeleton() {
  return <PanelSkeleton className="min-h-40" />;
}

export type SettingsPageProps = {
  section: SettingsSection;
};

/**
 * 设置页：嵌套路由分区（/settings/<section>）。
 * 「账号」沿用 legacy 的 /settings/profile 路径（侧栏与重定向均指向它）。
 *
 * 分区切换用**页内 Tab**（D-12 的形态）：设置不是一级导航，四个分区是同一页的四面，
 * 用下划线高亮当前那一面——用一排胶囊按钮会让人以为是四个并列的目的地。
 */
export function SettingsPage({ section }: SettingsPageProps) {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-6" data-testid="settings-page">
      <div className="space-y-2">
        <h1 className="text-title text-label">设置</h1>
        <p className="text-body text-label-secondary">管理你的个人资料与使用偏好。</p>
      </div>

      <nav
        aria-label="设置分区"
        className="flex flex-wrap gap-1 border-b border-separator"
        data-testid="settings-nav"
      >
        {SETTINGS_SECTIONS.map(({ key, label }) => {
          const active = key === section;
          return (
            <Link
              key={key}
              href={`/settings/${key}`}
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : "false"}
              className={cn(
                // 下划线压在 nav 的 1px 分隔线上，选中态因此与"当前页"同高
                "-mb-px border-b-2 px-3 py-2 text-footnote outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-accent font-medium text-accent"
                  : "border-transparent text-label-secondary hover:text-label",
              )}
              data-testid={`settings-nav-${key}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {section === "profile" ? <AccountSettings /> : null}
      {section === "appearance" ? <AppearanceSettings /> : null}
      {section === "ai" ? <AiSettings /> : null}
      {section === "integrations" ? <IntegrationsSettings /> : null}
    </section>
  );
}
