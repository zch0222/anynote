/**
 * 相对时间文案：设计稿里统一用「2 小时前 / 昨天 / 3 天前 / 上周」，
 * 而不是 `2026-09-13 23:44` 这样的裸时间戳——卡片上裸露时间戳读不出远近。
 *
 * 纯函数，`now` 可注入，所以边界能被单测钉死。
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 未来时间（服务端时钟略快、或本地时钟慢）一律按"刚刚"处理，不显示"负 x 分钟前"。 */
export function formatRelativeTime(input: string | null | undefined, now: number = Date.now()) {
  if (!input) return "";
  const time = Date.parse(input);
  if (Number.isNaN(time)) return "";

  const delta = now - time;
  if (delta < MINUTE) return "刚刚";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)} 分钟前`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)} 小时前`;

  const days = Math.floor(delta / DAY);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 14) return "上周";
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

/**
 * `n 篇笔记 · n 节慕课 · n 个任务` 这类元信息行。
 * 零值不显示——"0 个任务"是噪音，卡片上只留真实存在的维度。
 */
export function formatCountLine(
  parts: readonly { count: number | null | undefined; unit: string }[],
): string {
  return parts
    .filter((part) => typeof part.count === "number" && part.count > 0)
    .map((part) => `${part.count} ${part.unit}`)
    .join(" · ");
}

/**
 * 卡片副标题：优先展示相对更新时间，没有就退回元信息行。
 * 两段都有时用 `·` 连接，与设计稿的 `128 篇笔记 · 6 节慕课 · 2 小时前更新` 一致。
 */
export function formatCardMeta({
  updatedAt,
  counts,
  now,
}: {
  updatedAt?: string | null | undefined;
  counts?: readonly { count: number | null | undefined; unit: string }[] | undefined;
  now?: number | undefined;
}) {
  const line = counts ? formatCountLine(counts) : "";
  const relative = formatRelativeTime(updatedAt, now);
  if (line && relative) return `${line} · ${relative}更新`;
  if (relative) return `${relative}更新`;
  return line;
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * 日期时间：`2026-09-16 09:00`（**含年份**）。
 *
 * 与 `formatRelativeTime` 的分工：相对时间用于"多久以前动过"这类列表元信息，
 * 而这个用于**用户要照着做事的绝对时刻**——任务的起止时间、提交时间。
 * 画板上这两处都带年份（`2026-09-10 ~ 2026-09-18`、`09-12 14:30` 是提交时间），
 * 少了年份在跨年的任务上会读错。
 *
 * 用本地时区：这些值是给人排期的，用户看到的应该是自己表上的时间。
 * 非法 / 空输入返回空串，由调用方决定回退文案（如 `—`）。
 */
export function formatDateTime(input: string | null | undefined): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 仅日期：`2026-09-16`。任务时间窗口用得到（窗口精确到天就够读）。 */
export function formatDate(input: string | null | undefined): string {
  const full = formatDateTime(input);
  return full ? full.slice(0, 10) : "";
}

/**
 * 月日 + 时分：`09-12 14:30`。提交时间列用（同一年内的提交，年份是噪音）。
 */
export function formatMonthDayTime(input: string | null | undefined): string {
  const full = formatDateTime(input);
  return full ? full.slice(5) : "";
}

/**
 * 任务时间窗口：`2026-09-10 ~ 2026-09-18`。
 *
 * 画板原文用的是**波浪号 `~`** 而不是 en dash `–`，两端都只到天。
 * 任一端缺失就给断开的半截，两端都缺返回空串（调用方回退 `—`）。
 */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return `${from} ~ ${to}`;
  return from || to || "";
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

/**
 * 待办行的截止日期：`截止 09-18 周四`（M-01 图例 13 原文）。
 *
 * 为什么带星期：待办是"这几天要做的事"，用户心里的刻度是"周几"而不是"18 号"。
 * 为什么省年份：这一行服务的是**近期**待办，跨年时"12-28 周一"仍然能读懂。
 * 解析不出来时返回空串——宁可少一行，也不要显示 `截止 无效日期`。
 */
export function formatDueLine(endTime: string | null | undefined): string {
  if (!endTime) return "";
  const date = new Date(endTime);
  if (Number.isNaN(date.getTime())) return "";
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `截止 ${month}-${day} ${WEEKDAYS[date.getDay()]}`;
}
