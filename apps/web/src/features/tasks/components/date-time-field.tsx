"use client";

import { CalendarSkeleton } from "@/components/loading/skeletons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

/**
 * 浮层内容按需加载：它引 `date-fns`（整包约 15 KB gzip），而这只在用户真的
 * 点开日历时才需要。静态引入会把整包压进任务表单的首屏——那条路由的预算
 * 只剩十几 KB，`pnpm --filter web bundle:budget` 会卡。
 *
 * 骨架给 `CalendarSkeleton`：与即将出现的"月份行 + 7 列日期格"同形，
 * 加载完成时不会整块跳一下。
 */
const DateTimeCalendar = dynamic(
  () => import("./date-time-calendar").then((mod) => mod.DateTimeCalendar),
  { ssr: false, loading: () => <CalendarSkeleton /> },
);

export type DateTimeFieldProps = {
  /** 触发器元素的 id，页面用它做「滚到第一个错误字段」的锚点。 */
  id?: string;
  /** 字段名。既作触发器的可访问名（「开始时间」），也用于浮层里的月份标题。 */
  label: string;
  value: Date;
  onChange: (next: Date) => void;
  disabled?: boolean;
  /** 可选下界（含当天）：早于它的日期格不可点。 */
  min?: Date;
  invalid?: boolean;
  className?: string;
};

/** 两位补零。刻意**不用 `date-fns` 的 `format`**：那会把整包拖进首屏（见上）。 */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `MM-dd HH:mm`，与 `date-fns` 的 `format(value, "MM-dd HH:mm")` 同形。 */
function formatTrigger(value: Date): string {
  return `${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/**
 * 日期时间选择（D-18 图例 6 / 7 / 12）。
 *
 * 触发器只读、浮层里才编辑。**每次打开都从当前值重置草稿**——
 * 上一次点开又取消留下的日期若留到下一次，用户会以为"我上次选的还算数"。
 */
export function DateTimeField({
  id,
  label,
  value,
  onChange,
  disabled = false,
  min,
  invalid = false,
  className,
}: DateTimeFieldProps) {
  const [open, setOpen] = useState(false);
  /*
   * 重挂浮层内容的钥匙：每次打开 +1，让 `DateTimeCalendar` 重新初始化草稿。
   * 用 key 而不是把草稿状态提到这里，是为了让「草稿」这件事完全留在浮层内——
   * 触发器这边不需要知道有草稿存在。
   */
  const [openCount, setOpenCount] = useState(0);

  function handleOpenChange(next: boolean) {
    if (next) setOpenCount((count) => count + 1);
    setOpen(next);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        id={id}
        aria-label={label}
        aria-invalid={invalid}
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center gap-1.5 rounded-md border border-separator bg-surface px-3 text-left text-footnote text-label outline-none transition-colors",
          "hover:bg-fill-hover focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-50",
          "aria-invalid:border-danger aria-invalid:ring-3 aria-invalid:ring-danger/20",
          className,
        )}
      >
        <Clock className="size-4 text-label-secondary" aria-hidden="true" />
        <span className="tabular-nums">{formatTrigger(value)}</span>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[296px] p-3">
        {open ? (
          <DateTimeCalendar
            key={openCount}
            value={value}
            min={min}
            onConfirm={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
