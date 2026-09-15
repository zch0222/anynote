import type { TaskHeatmapMember } from "../schemas";

/**
 * 热力图的色阶分档、排序折叠与"未到"判定（D-17 图例 16–19）。
 *
 * 与 `task-window.ts` 一样是纯函数：分档边界、折叠行数、未来列都由单测钉死。
 */

/** 色阶档数：0 档（没编辑）+ 1–5 档（`--heat-0` … `--heat-5`）。 */
export const HEAT_LEVELS = 5;

/**
 * 次数 → 档位。0 次是 0 档（中性灰，不是最浅的蓝），
 * 其余按 `ceil(count / max * 5)` 线性分档并夹到 1–5。
 *
 * `max <= 0`（整张图没有任何编辑）时全部落 0 档：这时任何非零 count 都是脏数据，
 * 除以 0 会得到 `Infinity`、`ceil` 之后进 5 档，把一格灰点成最深的蓝。
 */
export function levelOf(count: number, max: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.min(HEAT_LEVELS, Math.max(1, Math.ceil((count / max) * HEAT_LEVELS)));
}

/** 折叠阈值：超过 12 人时按编辑总数排序，其余合并成「其余 N 人」一行。 */
export const HEAT_MEMBER_LIMIT = 12;

export type HeatmapRow = {
  /** 唯一 key：折叠行用 `rest`。 */
  key: string;
  label: string;
  counts: number[];
  /** 是否是折叠出来的「其余 N 人」行——它不可再展开，也不参与 tooltip 的成员名。 */
  collapsed: boolean;
  /** 被折叠进来的人数（仅 `collapsed` 行有值）。 */
  memberCount: number;
};

/**
 * 把成员行整理成渲染用的行：按 `total` 降序取前 `limit` 行，
 * 其余合并成一行「其余 N 人」，`counts` 逐日相加。
 *
 * 排序取**降序**而不是保持后端顺序：后端虽然也按 total 排，但前端不该依赖
 * 一个没写进契约的顺序；而且折叠之后"前 12 名"必须是真正的活跃前 12 名。
 */
export function collapseMembers(
  rows: readonly TaskHeatmapMember[],
  limit: number = HEAT_MEMBER_LIMIT,
): HeatmapRow[] {
  const normalized = rows.map((row, index) => ({
    key: `member-${row.userId ?? index}`,
    label: row.nickname?.trim() || row.username?.trim() || "未命名成员",
    counts: row.counts ?? [],
    total: row.total ?? (row.counts ?? []).reduce((sum, n) => sum + n, 0),
  }));

  // 稳定排序：total 相同时保持后端给的先后，避免同一份数据两次渲染行序不同
  const sorted = normalized
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.total - a.row.total || a.index - b.index)
    .map((item) => item.row);

  if (sorted.length <= limit) {
    return sorted.map((row) => ({
      key: row.key,
      label: row.label,
      counts: row.counts,
      collapsed: false,
      memberCount: 1,
    }));
  }

  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const days = Math.max(0, ...sorted.map((row) => row.counts.length));
  const restCounts = Array.from({ length: days }, (_, day) =>
    rest.reduce((sum, row) => sum + (row.counts[day] ?? 0), 0),
  );

  return [
    ...head.map((row) => ({
      key: row.key,
      label: row.label,
      counts: row.counts,
      collapsed: false,
      memberCount: 1,
    })),
    {
      key: "rest",
      label: `其余 ${rest.length} 人`,
      counts: restCounts,
      collapsed: true,
      memberCount: rest.length,
    },
  ];
}

/**
 * 这一列是不是"还没到"（图例 17 的「未到」空格）。
 *
 * `today` 用**服务端**给的日期而不是本地 `new Date()`：客户端时区落后于服务端时，
 * 本地还是 09-11 而服务端已经 09-12，用本地日期会把服务端已经算进统计的那一天
 * 画成空格，读数与数据对不上。`days` 里的字符串就是 `yyyy-MM-dd`，直接字典序比较。
 */
export function isFutureDay(day: string, today: string | null | undefined): boolean {
  if (!today) return false;
  return day > today;
}

/** `yyyy-MM-dd` → `MM-dd`（图例 18 的列头与图例 19 的 tooltip 都用这个）。 */
export function formatHeatDay(day: string): string {
  return day.slice(5);
}

/**
 * 热力格的 `aria-label` / tooltip 文案：`{昵称} · {MM-dd} 编辑 {n} 次`（图例 19）。
 *
 * 折叠行不能报成员名（那是 N 个人的合计），改成「其余 N 人」并把人数说清楚。
 */
export function heatCellLabel(row: HeatmapRow, day: string, count: number): string {
  return `${row.label} · ${formatHeatDay(day)} 编辑 ${count} 次`;
}
