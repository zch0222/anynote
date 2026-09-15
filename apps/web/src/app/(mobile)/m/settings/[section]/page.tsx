import { MobileSettingsPage } from "@/features/settings/components/mobile-settings";
import {
  MOBILE_SETTINGS_SECTIONS,
  type MobileSettingsSection,
} from "@/features/settings/components/mobile/settings-sections";
import { notFound } from "next/navigation";

const VALID_SECTIONS = MOBILE_SETTINGS_SECTIONS.map((item) => item.key);

export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  // 与桌面一致：/settings/account 是 profile 的旧路径别名
  const normalized = section === "account" ? "profile" : section;
  if (!VALID_SECTIONS.includes(normalized as MobileSettingsSection)) notFound();
  return <MobileSettingsPage section={normalized as MobileSettingsSection} />;
}
