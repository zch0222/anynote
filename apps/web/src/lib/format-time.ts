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
