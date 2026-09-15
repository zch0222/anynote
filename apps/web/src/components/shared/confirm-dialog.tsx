"use client";

import { Spinner } from "@/components/loading/spinner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ReactNode } from "react";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** 提交中显示的文案，缺省沿用 `confirmLabel`。 */
  pendingLabel?: string;
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
};

/**
 * 二次确认对话框（D-04 ④ · D-10 ② · D-09 ① · D-17 ② · D-16 ①）。
 *
 * 取代全站的 `window.confirm`：原生确认框无法用语义 Token 上色、
 * 在深色下是系统灰、且会阻塞主线程。这里统一成设计稿的四条规格——
 * 宽 384（`max-w-sm` + 2rem 边距）、圆角 14、页脚 1px 分隔 + `bg-fill-footer`、
 * 按钮右对齐且主按钮在最右。
 *
 * 三个刻意的行为：
 * 1. **默认焦点落在「取消」**：破坏性操作不该让回车直接生效。
 *    基座 Dialog 的初始焦点是第一个可聚焦元素，而「取消」在 DOM 里排在确认键前面，
 *    所以顺序本身就把焦点放在了对的位置——不额外抢焦点，读屏的播报顺序也更自然。
 * 2. **`pending` 时两个按钮都禁用**：只禁确认键的话，用户可以在请求飞行中
 *    再点一次取消，界面关掉而请求还在跑，回头看到"操作生效了"会莫名其妙。
 * 3. **不做「确认后自动关闭」**：关闭时机交给调用方（成功后再关），
 *    否则失败时对话框已经没了，用户看不到错误。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = "default",
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle className="text-base font-medium">{title}</DialogTitle>
          <DialogDescription className="text-footnote text-label-secondary">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <>
                <Spinner size="button" aria-hidden="true" />
                {pendingLabel ?? confirmLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
