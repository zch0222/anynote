"use client";

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
 */
export function SettingsPage({ section }: SettingsPageProps) {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-6" data-testid="settings-page">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">设置</h1>
        <p className="text-sm text-muted-foreground">管理你的个人资料与使用偏好。</p>
      </div>

      <nav aria-label="设置分区" className="flex flex-wrap gap-2 border-b pb-3">
        {SETTINGS_SECTIONS.map(({ key, label }) => (
          <Link
            key={key}
            href={`/settings/${key === "profile" ? "profile" : key}`}
            className={`rounded-lg px-3 py-1.5 text-sm outline-none transition-colors ${
              key === section
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
            data-testid={`settings-nav-${key}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {section === "profile" ? <AccountSettings /> : null}
      {section === "appearance" ? <AppearanceSettings /> : null}
      {section === "ai" ? <AiSettings /> : null}
      {section === "integrations" ? <IntegrationsSettings /> : null}
    </section>
  );
}
