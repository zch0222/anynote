"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Check, type LucideIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";

export type MobileAction = {
  label: string;
  icon?: LucideIcon;
  /** 危险动作：红色，且必须给 `confirm`（见下）。 */
  destructive?: boolean;
  /**
   * 二次确认文案。给了之后第一次点击只切到确认态，第二次才执行——
   * 触摸端误触成本高，删除类动作不能一点就走。
   */
  confirm?: string;
  disabled?: boolean;
  /** 单选类动作表（性别等）：当前值行尾打勾，勾在**最右**而不是文字旁边。 */
  checked?: boolean;
  onSelect: () => void;
};

export type MobileActionSheetProps = {
  /** 触发元素；受控使用（传 `open`）时可以不给。 */
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  actions: MobileAction[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * 底部动作表：桌面 `DropdownMenu` 的移动端替代（方案 D6）。
 *
 * 下拉菜单在手机上是反模式——锚点在手指底下、命中区只有 28px。
 * 这里用已有的 `ui/sheet` 的 `side="bottom"`，每项 48px 高。
 *
 * 画板形态（M-02 ② / M-13 ② 等）：顶部一个抓手，动作列表之下**永远有一张独立的
 * 「取消」卡**——Escape 能关只证明桌面键盘退得出，手机上必须有看得见的取消。
 */
export function MobileActionSheet({
  trigger,
  title,
  description,
  actions,
  open,
  onOpenChange,
}: MobileActionSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const isOpen = open ?? internalOpen;

  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  // 关闭后清掉确认态，下次打开不会停在"再点一次删除"上
  useEffect(() => {
    if (!isOpen) setConfirming(null);
  }, [isOpen]);

  const handleSelect = (action: MobileAction) => {
    if (action.confirm && confirming !== action.label) {
      setConfirming(action.label);
      return;
    }
    setOpen(false);
    action.onSelect();
  };

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      {trigger ? <SheetTrigger render={trigger} /> : null}
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[80svh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"
        data-testid="mobile-action-sheet"
      >
        {/* 抓手：画板每个底部面板顶部都有一条 36×5 的圆角条 */}
        <div className="-mt-2 flex justify-center pt-3" aria-hidden="true">
          <span className="h-[5px] w-9 rounded-full bg-separator" />
        </div>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <ul className="px-2 pb-2">
          {actions.map((action) => {
            const Icon = action.icon;
            const pending = confirming === action.label;
            return (
              <li key={action.label}>
                <button
                  type="button"
                  disabled={action.disabled}
                  onClick={() => handleSelect(action)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm outline-none transition-colors",
                    "hover:bg-fill-hover focus-visible:bg-fill-hover disabled:pointer-events-none disabled:opacity-50",
                    action.destructive && "text-danger",
                  )}
                >
                  {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
                  <span className="min-w-0 flex-1 truncate">
                    {pending ? action.confirm : action.label}
                  </span>
                  {action.checked ? (
                    <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-2 pb-2">
          <button
            type="button"
            data-testid="mobile-action-sheet-cancel"
            onClick={() => setOpen(false)}
            className="flex min-h-12 w-full items-center justify-center rounded-lg bg-fill-hover text-sm font-medium text-label outline-none transition-colors hover:bg-fill-hover/70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            取消
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
