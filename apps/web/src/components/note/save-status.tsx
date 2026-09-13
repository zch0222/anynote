"use client";

import type { NoteSaveStatus } from "@/features/notes/use-save-note";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, CloudOff, GitCompareArrows, Loader2, PenLine } from "lucide-react";

const presentation: Record<
  NoteSaveStatus,
  { label: string; icon: typeof Check; className: string; spin?: boolean }
> = {
  saved: { label: "已保存", icon: Check, className: "text-success" },
  pending: { label: "待保存", icon: PenLine, className: "text-label-secondary" },
  saving: { label: "保存中", icon: Loader2, className: "text-label-secondary", spin: true },
  offline: { label: "离线，改动已暂存", icon: CloudOff, className: "text-warning" },
  error: { label: "保存失败，正在重试", icon: AlertTriangle, className: "text-danger" },
  conflict: { label: "内容有冲突", icon: GitCompareArrows, className: "text-danger" },
};

/**
 * 编辑器页头的保存状态指示；`role="status"` 让屏幕阅读器能播报变化。
 *
 * 设计稿里它是一个**胶囊徽标**（`已保存` 绿底），不是一行裸文字：
 * 正文区域信息密度高，状态需要靠底色从文字流里跳出来。
 */
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
    <output
      data-status={status}
      className={cn(
        "tabular inline-flex min-h-6 items-center gap-1.5 rounded-full bg-grouped px-2.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className={cn("size-3.5", spin && "animate-spin")} aria-hidden="true" />
      {savedAt ? `${label} ${savedAt}` : label}
    </output>
  );
}
