"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/features/settings/components/account-settings";
import { AccountSettings } from "@/features/settings/components/account-settings";
import { AiSettings } from "@/features/settings/components/ai-settings";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { IntegrationsSettings } from "@/features/settings/components/integrations-settings";

/**
 * `/m/settings/[section]`：设置子页。
 *
 * 桌面把四个分区摊成横向 tabs 常驻在页头；移动端拆成"我的 → 分区"两级，
 * 分区内容**直接复用桌面组件**——它们是纵向表单，窄屏本来就能用。
 */
export function MobileSettingsPage({ section }: { section: SettingsSection }) {
  const label = SETTINGS_SECTIONS.find((item) => item.key === section)?.label ?? "设置";

  return (
    <MobileScreen title={label} back="/m/me">
      <div className="p-4" data-testid={`mobile-settings-${section}`}>
        {section === "profile" ? <AccountSettings /> : null}
        {section === "appearance" ? <AppearanceSettings /> : null}
        {section === "ai" ? <AiSettings /> : null}
        {section === "integrations" ? <IntegrationsSettings /> : null}
      </div>
    </MobileScreen>
  );
}
