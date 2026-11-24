"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Copy, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export type MessageActionsProps = {
  /** 要写入剪贴板的原始消息内容。 */
  content: string;
  /** 传入时显示重新提问按钮。 */
  onRetry?: (() => void) | undefined;
  /** 操作栏对齐方向。 */
  align?: "start" | "end";
  className?: string;
};

/**
 * 将消息原文写入系统剪贴板。
 *
 * @param content 原始消息内容
 * @returns 写入完成的 Promise
 * @author 称霸幼儿园
 */
async function copyMessageContent(content: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API is unavailable");
  }
  await navigator.clipboard.writeText(content);
}

/**
 * 消息复制与重新提问操作栏。
 *
 * @param props 消息原文、重新提问回调与对齐方式
 * @author 称霸幼儿园
 */
export function MessageActions({
  content,
  onRetry,
  align = "start",
  className,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await copyMessageContent(content);
      setCopied(true);
    } catch {
      toast.error("复制失败，请手动选择文本复制");
    }
  };

  return (
    <div
      className={cn(
        "flex h-8 items-center gap-1 transition-opacity",
        align === "end" ? "justify-end" : "justify-start",
        !onRetry &&
          "md:opacity-0 md:group-focus-within/message:opacity-100 md:group-hover/message:opacity-100",
        className,
      )}
      data-testid="message-actions"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="rounded-md text-label-tertiary"
        aria-label={copied ? "已复制" : "复制"}
        title={copied ? "已复制" : "复制"}
        onClick={() => void handleCopy()}
      >
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
      </Button>
      {onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rounded-md text-label-tertiary"
          aria-label="重新提问"
          title="重新提问"
          onClick={onRetry}
        >
          <RotateCcw className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
