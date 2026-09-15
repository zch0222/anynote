/**
 * 笔记历史版本的按天分组（D-16 图例 11）。
 *
 * 列表从 `/notes/historyList` 拿到的是**一串扁平的时间戳**，直接铺出来是一列
 * `2026-09-12 23:44` 这样的裸时间，读不出"哪几条是同一批"。画板要求按
 * 今天 / 昨天 / `09-12 周六` 分组——这三个标签解决的是同一个问题：
 * 让人一眼看到"最近动过"和"很久没动"的边界。
 *
 * 两条口径上的决定：
 *
 * 1. **按本地日历天切，不按 24 小时差**。23:59 保存的版本与次日 00:01 保存的
 *    版本相差 2 分钟，但它们属于"昨天"和"今天"两个组——用户脑子里的"昨天"
 *    是日期，不是时间差。
 * 2. **跨年补年份**。`09-12` 在同年内没有歧义，跨越年份之后
 *    "09-12 周六" 到底指哪一年就说不清了，所以换成 `2025-09-12 周五`。
 *
 * 本文件是纯函数：`now` 可注入，所以今天 / 昨天 / 跨年这些边界能被单测钉死。
 */

/** 分组结果：标签 + 该组下的条目（保持入参顺序）。 */
export type HistoryGroup<T> = { label: string; items: T[] };

/**
 * 时间字段的可选形态。
 *
 * 列表端点返回 `operationTime`，单版本详情返回 `historyTime`，两者是同一件事
 * （服务端的两张表各起了一个名字）。这里两者都接，调用方把自己的行类型
 * 原样传进来即可，不必为了分组去改一份数据。
 */
type TimeBearing = {
  historyTime?: string | null | undefined;
  operationTime?: string | null | undefined;
};

/** 时间解析失败时的兜底分组。不静默丢弃——丢一条就是"历史里少了一个版本"。 */
export const UNKNOWN_DAY_LABEL = "未知时间";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

/** 取本地日历日的起点，用于比较"是不是同一天"。 */
function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 单条记录的分组标签。
 *
 * `now` 与 `date` 同年时用 `MM-dd 周X`，跨年补全年份：只写 `09-12` 会让人
 * 误以为是今年，而历史版本恰恰是唯一会翻出好几年前内容的地方。
 */
function labelOf(date: Date, now: Date): string {
  // 用"日历日序号"而不是时间差：23:59 → 00:01 只差 2 分钟，却是两天
  const dayDiff = Math.round(
    (startOfLocalDay(now) - startOfLocalDay(date)) / (24 * 60 * 60 * 1000),
  );
  if (dayDiff === 0) return "今天";
  if (dayDiff === 1) return "昨天";

  const weekday = WEEKDAYS[date.getDay()] ?? "";
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  // 未来时间（服务端时钟略快）落到这里时 dayDiff < 0，按具体日期显示即可，
  // 不值得为几秒的时钟漂移单独造一个"明天"标签
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}-${month}-${day} ${weekday}`;
  }
  return `${month}-${day} ${weekday}`;
}

/**
 * 把历史版本按天分组。
 *
 * **保持入参顺序**：后端已经按 `operation_time DESC` 排好，这里只做相邻合并，
 * 不重新排序——重排会让"第一条 = 当前版本"这个前提失效（面板靠它打「当前版本」徽标）。
 * 因此同一天的记录必须相邻，这一点由端点保证；万一不相邻，也只是同一标签
 * 出现两次，不会串行。
 */
export function groupByDay<T extends TimeBearing>(
  items: readonly T[],
  now: Date = new Date(),
): HistoryGroup<T>[] {
  const groups: HistoryGroup<T>[] = [];

  for (const item of items) {
    const raw = item.operationTime ?? item.historyTime;
    const parsed = raw ? new Date(raw) : null;
    const label =
      parsed && !Number.isNaN(parsed.getTime()) ? labelOf(parsed, now) : UNKNOWN_DAY_LABEL;

    const last = groups.at(-1);
    // 只与**上一组**比较：同一天的记录在列表里是连续的，合并相邻即可
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return groups;
}

/**
 * 版本行的精确时间：「今天 11:05」/「昨天 23:59」/「09-12 09:00」。
 *
 * 与分组标签同源（都从 `labelOf` 的日历日判定出发），所以一行里的
 * 「今天」和它所在分组的「今天」永远不会打架——这正是 `formatRelativeTime`
 * 做不到的：它在 00:05 会把 23:50 说成「15 分钟前」，而顶上的分组却写着
 * 「昨天」，同一屏里两句话互相矛盾。
 *
 * 历史版本要看的是**几点几分**（"我上午改的那版"），相对时间反而丢信息。
 */
export function formatHistoryTime(
  input: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const day = labelOf(date, now);
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  // 三种标签都已说明是哪一天（今天 / 昨天 / MM-dd 周X），后面接上都读得通
  return `${day} ${time}`;
}
