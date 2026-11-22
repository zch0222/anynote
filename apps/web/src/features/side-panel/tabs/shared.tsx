"use client";

import { Button } from "@/components/ui/button";
import { type ResourceLocator, type ResourceTarget, resourceHref } from "@/lib/ai/resource-target";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { RES_CODE } from "@anynote/api-core/codes";
import { AlertCircle, FileQuestion } from "lucide-react";
import type { TabRecord } from "../types";

/**
 * 各类资源正文共用的不可读、加载失败与地址工具。
 *
 * @author 称霸幼儿园
 */

export const UNREADABLE_TITLE = "未找到或无权访问的内容";
export const LOAD_FAILED = "加载失败，请稍后重试";

/**
 * 判断错误是否等价于「不存在或无权访问」。
 *
 * @param error 查询错误
 * @returns 不存在或无权限时为真
 */
export function isResourceUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return (
    error.status === 404 ||
    error.status === 403 ||
    error.code === RES_CODE.UNAUTHORIZED ||
    error.code === RES_CODE.BAD_PARAM ||
    error.code === "A0404"
  );
}

/** 不存在与无权访问共用的不可读状态。 */
export function ResourceUnavailable({ className }: { className?: string }) {
  return (
    <output className={cn("flex flex-col items-center gap-2 px-4 py-10 text-center", className)}>
      <FileQuestion className="size-7 text-label-tertiary" aria-hidden="true" />
      <p className="text-sm text-label-secondary">{UNREADABLE_TITLE}</p>
    </output>
  );
}

/** 网络错误与重试。 */
export function ResourceError({
  onRetry,
  retrying = false,
  compact = false,
  className,
}: {
  onRetry?: (() => void) | undefined;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-2 rounded-md bg-danger/6 p-3 dark:bg-danger/10",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <p className="min-w-0 text-label">{LOAD_FAILED}</p>
      </div>
      {onRetry ? (
        <div>
          <Button variant="outline" size="xs" disabled={retrying} onClick={onRetry}>
            重试
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 由标签记录与定位生成完整页面地址。
 *
 * @param record 标签记录
 * @param locator 定位
 * @param variant 桌面或移动端
 * @returns 站内地址，页面类标签为空
 */
export function tabHref(
  record: TabRecord,
  locator: ResourceLocator,
  variant: "desktop" | "mobile",
): string | null {
  if (record.family !== "resource") return null;
  return resourceHref({ ref: record.ref, locator }, variant);
}

/**
 * 由标签记录与定位生成资源目标。
 *
 * @param record 标签记录
 * @param locator 定位
 * @returns 资源目标，页面类标签为空
 */
export function tabTarget(record: TabRecord, locator: ResourceLocator): ResourceTarget | null {
  return record.family === "resource" ? { ref: record.ref, locator } : null;
}

/**
 * 正文头部的元信息：知识库名 · 类型名。
 *
 * @param kbName 知识库名
 * @param typeLabel 类型名
 * @returns 用 `·` 连接的非空片段
 */
export function resourceMeta(kbName: string | null | undefined, typeLabel: string): string {
  return [kbName?.trim(), typeLabel].filter(Boolean).join(" · ");
}
