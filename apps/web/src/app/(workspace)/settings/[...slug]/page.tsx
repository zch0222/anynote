import { SettingsPage } from "@/features/settings/components/settings-page";
import { isSettingsSection } from "@/features/settings/sections";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const section = slug[0];
  // /settings/account 与 /settings/profile 等价（账号分区沿用 legacy 路径名）
  const normalized = section === "account" ? "profile" : section;
  if (!isSettingsSection(normalized)) {
    notFound();
  }
  return <SettingsPage section={normalized} />;
}
