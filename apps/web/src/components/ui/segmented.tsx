"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** 无障碍名称，`label` 只是图标时必填。 */
  ariaLabel?: string;
};

export type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** 分组名称，读屏时能听出这几格在切换什么。 */
  label: string;
  size?: "md" | "sm";
  className?: string;
};

/**
 * 分段控件（设计稿里的「全部 / 我的 / 组织」）。
 *
 * 用 `radiogroup` 而不是 `tablist`：它切换的是**同一列表的过滤条件**，
 * 不切换面板，语义上是一组单选。这一点决定了键盘行为（方向键换值）与
 * 读屏播报（"3 选 1"）都正确。
 *
 * 视觉是一条浅底轨道 + 一个白色浮起的选中格，与 iOS 分段控件同形。
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className,
}: SegmentedProps<T>) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((option) => option.value === value);
    if (index === -1) return;
    // 方向键在选中项之间循环；Home / End 直达两端
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;

    event.preventDefault();
    const target = options[next];
    if (target) onChange(target.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      data-slot="segmented"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-segmented-track p-0.5",
        size === "sm" ? "text-footnote" : "text-footnote",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          // biome-ignore lint/a11y/useSemanticElements: 分段控件是单选语义，用 button + role=radio 才能拿到正确的方向键行为
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            // 只让选中项留在 tab 序列里，方向键在组内移动——radiogroup 的标准键盘模型
            tabIndex={active ? 0 : -1}
            data-active={active ? "true" : "false"}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex min-h-7 items-center justify-center rounded-xs px-3 font-medium outline-none transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-segmented-thumb text-label shadow-card"
                : "text-label-secondary hover:text-label",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
