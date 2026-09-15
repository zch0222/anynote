"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  set,
  startOfMonth,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export type DateTimeCalendarProps = {
  /** 当前值（打开浮层时的基准）。 */
  value: Date;
  /** 可选下界（含当天）：早于它的日期格不可点。 */
  min?: Date | undefined;
  onConfirm: (next: Date) => void;
};

/**
 * `HH:mm` 的严格形态。用 `exec` 而不是 `test` + `split`：
 * 分组一次拿到，且天然挡住空串 / 缺前导零 / 半全角冒号这些输入法常见产物。
 */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * 日期时间浮层的**内容**（D-18 图例 12）。
 *
 * 为什么与触发器分成两个文件：这里引 `date-fns`，而它只在用户真的点开浮层时
 * 才需要。放在 `date-time-field.tsx` 里会被任务表单静态拖进首屏（实测
 * `date-fns` 一个 chunk 15.1 KB gzip），而任务表单的路由预算只剩十几 KB。
 * 触发器那边用一个十行的本地格式化函数就够，不必为此付整包。
 *
 * 浮层里的改动是**草稿**：点日期格只移动选中格，改时间输入只改草稿，
 * 只有「确定」才回调。因为两个字段（开始 / 截止）要参与「截止必须晚于开始」的
 * 联动校验，边点边回填会让用户在还没选完时就看到一次错误提示。
 *
 * 时间非法时**不回填也不关浮层**，只在输入框下提示：关闭等于把用户输入的东西
 * 吞掉，重开还得再打一遍。
 */
export function DateTimeCalendar({ value, min, onConfirm }: DateTimeCalendarProps) {
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(value));
  const [selectedDay, setSelectedDay] = useState<Date>(value);
  const [timeDraft, setTimeDraft] = useState<string>(() => format(value, "HH:mm"));
  const [timeInvalid, setTimeInvalid] = useState(false);

  function handleConfirm() {
    const matched = TIME_PATTERN.exec(timeDraft.trim());
    if (!matched) {
      setTimeInvalid(true);
      return;
    }
    onConfirm(
      set(selectedDay, {
        hours: Number(matched[1]),
        minutes: Number(matched[2]),
        seconds: 0,
        milliseconds: 0,
      }),
    );
  }

  /** 下界归一化到当天零点，这样比较只受日期影响、与传入时刻无关。 */
  const minDay = min ? set(min, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 }) : null;
  const days = eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) });
  /** 首格前面要垫的空位：`eachDayOfInterval` 不带星期对齐信息，得自己补。 */
  const leadingBlanks = startOfMonth(viewMonth).getDay();
  // 每次渲染取一次"今天"，避免同一次渲染里多个格子各取一个时刻
  const today = new Date();

  return (
    <>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="上个月"
          onClick={() => setViewMonth((month) => addMonths(month, -1))}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span className="text-footnote font-medium text-label tabular-nums">
          {format(viewMonth, "yyyy 年 MM 月")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="下个月"
          onClick={() => setViewMonth((month) => addMonths(month, 1))}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            className="flex h-6 items-center justify-center text-xs text-label-tertiary"
          >
            {weekday}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 定长静态占位，无身份、不重排
          <span key={index} aria-hidden="true" />
        ))}
        {days.map((day) => {
          const isSelected = isSameDay(day, selectedDay);
          const isToday = isSameDay(day, today);
          const isDisabled = minDay !== null && day.getTime() < minDay.getTime();
          return (
            <button
              key={day.toISOString()}
              type="button"
              aria-label={format(day, "yyyy-MM-dd")}
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => setSelectedDay(day)}
              className={cn(
                "flex h-9 items-center justify-center rounded-md text-footnote tabular-nums transition-colors",
                isSelected ? "bg-accent text-white" : "text-label hover:bg-fill-hover",
                // 今天描边只是"定位"，不该盖过选中态的实心强调
                isToday && !isSelected && "border border-accent",
                isDisabled && "pointer-events-none opacity-40",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-separator pt-2.5">
        <Input
          aria-label="时间"
          aria-invalid={timeInvalid}
          className="h-8 w-20 tabular-nums"
          value={timeDraft}
          placeholder="HH:mm"
          pattern="^([01]\d|2[0-3]):[0-5]\d$"
          onChange={(event) => {
            setTimeDraft(event.target.value);
            setTimeInvalid(false);
          }}
        />
        <span className="flex-1 text-xs text-label-tertiary">24 小时制</span>
        <Button type="button" size="sm" onClick={handleConfirm}>
          确定
        </Button>
      </div>
      {timeInvalid ? (
        <p role="alert" className="text-xs text-danger">
          请输入 HH:mm 格式的时间
        </p>
      ) : null}
    </>
  );
}
