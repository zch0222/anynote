"use client";

import type { NoteSaveStatus } from "@/features/notes/use-save-note";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, CloudOff, GitCompareArrows, Loader2, PenLine } from "lucide-react";

const presentation: Record<
  NoteSaveStatus,
  { label: string; icon: typeof Check; className: string; spin?: boolean }
> = {
  saved: { label: "已保存", icon: Check, className: "text-muted-foreground" },
  pending: { label: "待保存", icon: PenLine, className: "text-muted-foreground" },
  saving: { label: "保存中", icon: Loader2, className: "text-muted-foreground", spin: true },
  offline: {
    label: "离线，改动已暂存",
    icon: CloudOff,
    className: "text-amber-600 dark:text-amber-500",
  },
  error: { label: "保存失败，正在重试", icon: AlertTriangle, className: "text-destructive" },
  conflict: { label: "内容有冲突", icon: GitCompareArrows, className: "text-destructive" },
};

/** 编辑器页头的保存状态指示；`role="status"` 让屏幕阅读器能播报变化。 */
export function SaveStatusBadge({
  status,
  lastSavedAt,
  className,
}: {
  status: NoteSaveStatus;
  lastSavedAt?: Date | null;
  className?: string;
}) {
  const { label, icon: Icon, className: tone, spin } = presentation[status];
  const savedAt =
    status === "saved" && lastSavedAt
      ? `${lastSavedAt.getHours().toString().padStart(2, "0")}:${lastSavedAt
          .getMinutes()
          .toString()
          .padStart(2, "0")}`
      : null;
  return (
    // <output> 的隐式 role 就是 status（等价 aria-live="polite"），屏幕阅读器可播报状态变化
    <output className={cn("inline-flex items-center gap-1.5 text-xs", tone, className)}>
      <Icon className={cn("size-3.5", spin && "animate-spin")} aria-hidden="true" />
      {savedAt ? `${label} ${savedAt}` : label}
    </output>
  );
}
