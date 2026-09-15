"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import type { SettingsSection } from "./account-settings";
import { AccountSettings } from "./account-settings";
import { SETTINGS_SECTIONS } from "./account-settings";
import { AiSettings } from "./ai-settings";
import { AppearanceSettings } from "./appearance-settings";
import { IntegrationsSettings } from "./integrations-settings";

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
