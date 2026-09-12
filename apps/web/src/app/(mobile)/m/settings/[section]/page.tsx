import type { SettingsSection } from "@/features/settings/components/account-settings";
import { MobileSettingsPage } from "@/features/settings/components/mobile-settings";
import { notFound } from "next/navigation";

const VALID_SECTIONS: SettingsSection[] = ["profile", "appearance", "ai", "integrations"];

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  // 与桌面一致：/settings/account 是 profile 的旧路径别名
  const normalized = section === "account" ? "profile" : section;
  if (!VALID_SECTIONS.includes(normalized as SettingsSection)) notFound();
  return <MobileSettingsPage section={normalized as SettingsSection} />;
}
