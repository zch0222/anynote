import type { SettingsSection } from "@/features/settings/components/account-settings";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { notFound } from "next/navigation";

const VALID_SECTIONS: SettingsSection[] = ["profile", "appearance", "ai", "integrations"];

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const section = slug[0];
  // /settings/account 与 /settings/profile 等价（账号分区沿用 legacy 路径名）
  const normalized = section === "account" ? "profile" : section;
  if (!normalized || !VALID_SECTIONS.includes(normalized as SettingsSection)) {
    notFound();
  }
  return <SettingsPage section={normalized as SettingsSection} />;
}
