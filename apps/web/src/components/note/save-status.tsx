"use client";

import { Spinner } from "@/components/loading/spinner";
import type { CollabSyncStatus } from "@/features/collab/use-collab-note";
import type { NoteSaveFailure, NoteSaveStatus } from "@/features/notes/use-save-note";
import { cn } from "@/lib/utils";
import { EDITOR_SCHEMA_VERSION } from "@anynote/editor-core/version";
import {
  AlertTriangle,
  Ban,
  Check,
  CloudOff,
  GitCompareArrows,
  PenLine,
  RefreshCw,
} from "lucide-react";

const presentation: Record<
  NoteSaveStatus,
  {
    label: string;
    className: string;
    /**
     * 状态图标。`saving` 不在此列：转圈是全站统一的 `Spinner`，
     * 不再借 lucide 的 `Loader2` + `animate-spin` 自己拼一个转圈。
     */
    icon?: typeof Check;
  }
> = {
  saved: { label: "已保存", icon: Check, className: "text-success" },
  pending: { label: "待保存", icon: PenLine, className: "text-label-secondary" },
  saving: { label: "保存中", className: "text-label-secondary" },
  offline: { label: "离线，改动已暂存", icon: CloudOff, className: "text-warning" },
  error: { label: "保存失败，正在重试", icon: AlertTriangle, className: "text-danger" },
  conflict: { label: "内容有冲突", icon: GitCompareArrows, className: "text-danger" },
  failed: { label: "保存失败", icon: Ban, className: "text-danger" },
};

/** 不可重试失败在徽标上的短文案。 */
const failureLabel: Record<NoteSaveFailure["kind"], string> = {
  auth: "登录已过期，未保存",
  forbidden: "没有编辑权限，未保存",
  notFound: "笔记已不存在，未保存",
  invalid: "内容未被接受，未保存",
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
  collabConnected = false,
  failure = null,
}: {
  status: NoteSaveStatus;
  lastSavedAt?: Date | null;
  className?: string;
  /** 不可重试失败的原因，`status === "failed"` 时用于徽标文案。 */
  failure?: NoteSaveFailure | null;
  /**
   * 协同连接是否正常（方案 §7.4）。
   *
   * 协同模式下正文由在场所有人共同推进，本地 `lastSavedAt` 与本房间是否同步无关，
   * 停在「已保存 12 分钟前」会让用户误以为内容没被同步。因此**连上时**把已保存态
   * 改成「已同步」且不显示时间；保存中 / 保存失败 / 冲突仍按本地状态显示——
   * 那些是用户真正需要知道、且与连接状态正交的信息。
   */
  collabConnected?: boolean;
}) {
  const base = presentation[status];
  const label =
    status === "failed" && failure
      ? failureLabel[failure.kind]
      : collabConnected && status === "saved"
        ? "已同步"
        : base.label;
  const Icon = base.icon;
  const tone = base.className;
  const savedAt =
    status === "saved" && !collabConnected && lastSavedAt
      ? `${lastSavedAt.getHours().toString().padStart(2, "0")}:${lastSavedAt
          .getMinutes()
          .toString()
          .padStart(2, "0")}`
      : null;
  return (
    // <output> 的隐式 role 就是 status（等价 aria-live="polite"），屏幕阅读器可播报状态变化
    <output
      data-status={status}
      title={status === "failed" && failure ? failure.message : undefined}
      className={cn(
        "tabular inline-flex min-h-6 items-center gap-1.5 rounded-full bg-fill-hover px-2.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      {status === "saving" || !Icon ? (
        <Spinner size="badge" />
      ) : (
        <Icon className="size-3.5" aria-hidden="true" />
      )}
      {savedAt ? `${label} ${savedAt}` : label}
    </output>
  );
}

/**
 * 不可重试的保存失败提示：说明原因并提供手动重试。
 *
 * 草稿仍保留在内存里；处理完原因（例如在其他标签页重新登录）后点「重试」即可再次保存。
 */
export function SaveFailureNotice({
  failure,
  onRetry,
  className,
}: {
  failure: NoteSaveFailure;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid="save-failure"
      data-kind={failure.kind}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-footnote text-danger",
        className,
      )}
    >
      <p className="min-w-0 flex-1">
        {failure.message}
        {failure.kind === "auth"
          ? "。改动仍在本页，重新登录后点「重试」保存。"
          : "。改动尚未保存。"}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-md border border-danger/40 px-3 py-1 font-medium outline-none hover:bg-danger/10 focus-visible:ring-2 focus-visible:ring-ring"
      >
        重试
      </button>
    </div>
  );
}

/**
 * 协同模式（服务端落库）下的同步徽标：连接中 / 已同步 / 同步中 / 离线 / 需刷新。
 *
 * 判据是服务端是否已收到改动，不展示「已保存 hh:mm」：写库由协同服务负责。
 */
export function CollabSyncBadge({
  status,
  editedWhileOffline = false,
  hasLocalPersistence = false,
  serverEditorVersion = null,
  className,
}: {
  status: CollabSyncStatus;
  /** 断线后有过编辑，离线文案据此补充改动的去向。 */
  editedWhileOffline?: boolean;
  /** 本地持久化是否可用。 */
  hasLocalPersistence?: boolean;
  /** 4426 关闭原因里的服务端编辑器版本，用于区分「前端旧」还是「服务端旧」。 */
  serverEditorVersion?: number | null;
  className?: string;
}) {
  const offlineLabel = editedWhileOffline
    ? hasLocalPersistence
      ? "离线，改动已保存在本设备"
      : "离线，改动尚未保存"
    : "离线";
  const outdatedLabel =
    serverEditorVersion !== null && serverEditorVersion < EDITOR_SCHEMA_VERSION
      ? "服务正在升级，请稍后刷新"
      : "有新版本，请刷新页面";
  const view: Record<CollabSyncStatus, { label: string; tone: string; icon: typeof Check | null }> =
    {
      connecting: { label: "连接中", tone: "text-label-secondary", icon: null },
      synced: { label: "已同步", tone: "text-success", icon: Check },
      unsynced: { label: "同步中", tone: "text-label-secondary", icon: RefreshCw },
      offline: { label: offlineLabel, tone: "text-warning", icon: CloudOff },
      outdated: { label: outdatedLabel, tone: "text-danger", icon: AlertTriangle },
    };
  const { label, tone, icon: Icon } = view[status];
  return (
    <output
      data-status={status}
      className={cn(
        "tabular inline-flex min-h-6 items-center gap-1.5 rounded-full bg-fill-hover px-2.5 text-xs font-medium",
        tone,
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : <Spinner size="badge" />}
      {label}
    </output>
  );
}
