"use client";

import { Spinner } from "@/components/loading/spinner";
import { Button, buttonVariants } from "@/components/ui/button";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { AlertTriangleIcon, PlugZapIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * Q-02「空态与错误态汇总」的四种形态。
 *
 * 加载态不在这里——它按宿主形状走 `components/loading/skeletons.tsx`，
 * 骨架必须长得像即将出现的内容，做成通用组件反而会退回"一个转圈打天下"。
 *
 * 四者的分工：
 *   QueryError      请求失败，且**重试有意义**
 *   EmptyState      请求成功但没有内容
 *   NotFoundState   请求成功但对象不存在 / 无权限
 *   ConnectionBanner 长连接断开，本地仍可继续操作
 * ------------------------------------------------------------------ */

export type QueryErrorProps = {
  /** 出错的对象，拼进「{object}加载失败：{message}」。 */
  object: string;
  /**
   * 原始错误，推荐写法：转换放在组件内部，调用方不必记得套 `toUserMessage`。
   *
   * 24 个调用点各自 `toUserMessage` 一定会漏，而漏掉的那个正好会把
   * 「请确认 collab 服务已启动」直接摆给用户看。
   */
  error?: unknown;
  /** 已经转好的文案；与 `error` 二选一（内部按 `toUserMessage` 兜底）。 */
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** 侧栏、对话框等窄容器用紧凑形态（不带图标、内边距更小）。 */
  compact?: boolean;
  className?: string;
};

/**
 * 请求失败 + 重试（Q-02「错误态」）。
 *
 * 与旧实现的差别只有一条，但很关键：**必须能重试**。
 * 之前 24 处错误态都只有一行「…加载失败：{message}」，网络抖动之后
 * 用户唯一的出路是刷新整页——丢掉滚动位置与已填表单。
 *
 * `role="alert"` 让读屏立刻播报，不必等用户逛到这块。
 */
export function QueryError({
  object,
  error,
  message,
  onRetry,
  retrying = false,
  compact = false,
  className,
}: QueryErrorProps) {
  const detail = message ?? toUserMessage(error);
  return (
    <div
      role="alert"
      data-slot="query-error"
      className={cn(
        "flex flex-col gap-2 rounded-md bg-danger/6 dark:bg-danger/10",
        compact ? "px-2.5 py-2" : "gap-3 px-4 py-3",
        className,
      )}
    >
      <div className={cn("flex items-start", compact ? "gap-2" : "gap-2.5")}>
        {compact ? null : (
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        )}
        <p className={cn("text-label", compact ? "text-xs" : "text-footnote")}>
          {object}加载失败：{detail}
        </p>
      </div>
      {onRetry ? (
        <div>
          <Button
            variant="outline"
            size={compact ? "xs" : "sm"}
            disabled={retrying}
            onClick={onRetry}
            className={compact ? "self-start" : undefined}
          >
            {retrying ? (
              <>
                <Spinner size="badge" />
                重试中…
              </>
            ) : (
              "重试"
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  /** 最多一个动作；设计稿不出现"两个并列按钮"的空态。 */
  action?: ReactNode;
  /** 用 `ol/li` 之类的列表宿主时需要更小的内边距。 */
  compact?: boolean;
  className?: string;
};

/**
 * 空态（Q-02「空态」）。
 *
 * 虚线框是设计稿的固定形态：它是"这里本该有东西"的语义，
 * 用实线卡片会被当成内容卡片、用纯文字会被当成说明。
 *
 * 标题 15–17 SemiBold、说明 13 `label-secondary` 是全局口径，
 * 所以这里写死，不接受覆盖——各页字号不一致正是 Q-02 里记录的问题之一。
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-separator text-center",
        compact ? "px-4 py-6" : "px-6 py-10",
        className,
      )}
    >
      {Icon ? <Icon className="mb-1 size-7 text-label-tertiary" aria-hidden="true" /> : null}
      <p className="text-[0.9375rem] font-semibold text-label sm:text-[1.0625rem]">{title}</p>
      {hint ? <p className="text-footnote text-label-secondary">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export type NotFoundStateProps = {
  /** 拼成「找不到这个{object}」。 */
  object: string;
  backHref: string;
  backLabel: string;
  className?: string;
};

/**
 * 不存在 / 无权限（Q-02「不存在」）。
 *
 * 两种情况**刻意共用一套文案**：区分"已删除"与"你没权限"会泄露对象是否存在，
 * 而且对用户来说下一步动作完全一样——返回。
 *
 * 返回按钮**必须保持链接语义**：这是用户在这个死胡同页面里唯一的出路，
 * 用 `<button>` + `router.push` 会丢掉新窗口打开、右键复制地址，
 * 也丢掉"这是一条导航"的播报。Base UI 的 `Button` 无论 `nativeButton` 取值
 * 都会强制 `role="button"`（连 `<a>` 也盖掉），所以这里直接套 `buttonVariants`
 * 渲染成 `<a>`，视觉与其它次按钮一致而语义仍是链接。
 */
export function NotFoundState({ object, backHref, backLabel, className }: NotFoundStateProps) {
  return (
    <div data-slot="not-found-state" className={cn("flex justify-center px-4 py-10", className)}>
      <div className="flex w-full max-w-sm flex-col items-center gap-2 rounded-xl bg-surface p-6 text-center shadow-card">
        <p className="text-[1.0625rem] font-semibold text-label">找不到这个{object}</p>
        <p className="text-footnote text-label-secondary">它可能已被删除，或者你还没有访问权限。</p>
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}

export type ConnectionBannerProps = {
  /** 缺省用协同场景的固定文案。 */
  message?: string;
  onReconnect?: () => void;
  reconnecting?: boolean;
  className?: string;
};

/**
 * 长连接断开提示条（D-11 `c-conn` · M-09 `m-conn`）。
 *
 * 与 `QueryError` 的关键差别：**断线不阻止继续操作**。
 * 协同编辑靠 Y.Doc 在本地保留改动，恢复连接后自动同步，
 * 所以这里是提示条而不是错误块，也不遮挡正文。
 */
export function ConnectionBanner({
  message = "连接已断开，恢复后会自动同步你的改动",
  onReconnect,
  reconnecting = false,
  className,
}: ConnectionBannerProps) {
  return (
    // 用 <output> 而不是 <div role="status">：前者自带 status 角色，
    // 少一层 ARIA 补丁；`flex` 覆盖它默认的 inline，版式不受影响。
    <output
      data-slot="connection-banner"
      className={cn(
        "flex min-h-9 items-center gap-2 rounded-md bg-warning/12 px-3 py-1.5 text-footnote text-label",
        className,
      )}
    >
      <PlugZapIcon className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <span className="min-w-0 flex-1">{message}</span>
      {onReconnect ? (
        <button
          type="button"
          onClick={onReconnect}
          disabled={reconnecting}
          className="shrink-0 font-medium text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {reconnecting ? "连接中…" : "重新连接"}
        </button>
      ) : null}
    </output>
  );
}
