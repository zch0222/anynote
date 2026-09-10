"use client";

import { WorkspacePlaceholder } from "@/components/layout/workspace-placeholder";
import { useMe } from "@/features/auth/use-me";

export default function DashboardPage() {
  const { data } = useMe();
  return (
    <WorkspacePlaceholder
      title={`欢迎回来，${data?.nickname || data?.username || "朋友"}`}
      description="从这里开始，记录与整理你的想法。"
    />
  );
}
