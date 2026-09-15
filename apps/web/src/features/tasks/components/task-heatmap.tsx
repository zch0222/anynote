"use client";

import { PanelSkeleton } from "@/components/loading/skeletons";
import { QueryError } from "@/components/shared/states";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  HEAT_LEVELS,
  type HeatmapRow,
  collapseMembers,
  formatHeatDay,
  heatCellLabel,
  isFutureDay,
  levelOf,
} from "@/features/tasks/lib/heatmap";
import { isHeatmapUnavailable, useTaskHeatmapQuery } from "@/features/tasks/use-task-detail";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import type * as React from "react";

/** 色阶档位 → Tailwind 工具类，走 `globals.css` 的 `--heat-*` Token（深色另取一组）。 */
const LEVEL_BG = [
  "bg-heat-0",
  "bg-heat-1",
  "bg-heat-2",
  "bg-heat-3",
  "bg-heat-4",
  "bg-heat-5",
] as const;

/**
 * 成员编辑活跃度热力图（D-17 图例 16–19）。
 *
 * 数据来自 B-1 新端点 `GET /admin/noteTasks/{id}/editHeatmap`：
 * 按天聚合、一条 SQL、区间限定在任务时间窗口内。**不回退到旧的
 * `/noteTasks/{id}/charts`**——那个端点按小时逐段查询、没有提交时还会空指针
 * （§1.4 第 6 条），数据口径与这张图也对不上。B-1 上线前请求 404，
 * 这里整卡不渲染：页面上不该出现一个用户无法处理、也无法理解的报错块。
 *
 * 布局用 CSS Grid（`gridTemplateColumns` 随天数变）而不是百分比宽度：
 * 列数由任务窗口长短决定（最多 62 列），百分比分摊会让 3 天的任务拉成
 * 三根巨柱、62 天的任务细到点不中。
 */
export function TaskHeatmap({ taskId }: { taskId: number }) {
  const heatmap = useTaskHeatmapQuery(taskId);

  // B-1 未上线 / 无权限：整卡隐藏（图例 16 的降级口径）
  if (heatmap.isError && isHeatmapUnavailable(heatmap.error)) {
    return null;
  }

  return (
    <section className="space-y-3" data-testid="task-heatmap-card">
      <header className="space-y-1">
        <h2 className="text-[0.9375rem] font-semibold text-label">成员编辑活跃度</h2>
        <p className="text-xs text-label-tertiary">
          已提交成员在任务时间窗口内对提交笔记的编辑次数。0 次为中性灰，「未到」的日期留空。
        </p>
      </header>

      {heatmap.isPending ? (
        <PanelSkeleton />
      ) : heatmap.isError ? (
        <QueryError
          object="编辑活跃度"
          message={toUserMessage(heatmap.error)}
          onRetry={() => void heatmap.refetch()}
          retrying={heatmap.isFetching}
        />
      ) : (
        <HeatmapChart
          days={heatmap.data?.days ?? []}
          today={heatmap.data?.today}
          rows={collapseMembers(heatmap.data?.members ?? [])}
        />
      )}
    </section>
  );
}

function HeatmapChart({
  days,
  today,
  rows,
}: {
  days: string[];
  today: string | null | undefined;
  rows: HeatmapRow[];
}) {
  if (days.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-separator p-6 text-center text-footnote text-label-secondary">
        这个任务还没有可统计的编辑记录。
      </p>
    );
  }

  const max = Math.max(0, ...rows.flatMap((row) => row.counts));
  // 行名 84px + 每天一列（格 26 宽）。列数由任务窗口长短决定（最多 62 列），
  // 动态值走 CSS 变量而不是内联 grid-template-columns（仓库约定，同 ProgressBar）
  const template = `5.25rem repeat(${days.length}, minmax(1.5rem, 1fr))`;

  return (
    <div className="space-y-3 overflow-x-auto">
      <div
        className="grid items-center gap-0.5 grid-cols-(--heat-template)"
        style={{ "--heat-template": template } as React.CSSProperties}
        data-testid="task-heatmap"
        data-days={days.length}
      >
        {/* 表头：日期列。左侧留出与行名等宽的空格，网格才对得齐 */}
        <div aria-hidden="true" />
        {days.map((day) => (
          <div
            key={day}
            className="pb-1 text-center text-[0.6875rem] text-label-tertiary tabular-nums"
          >
            {formatHeatDay(day).replace("-", "/")}
          </div>
        ))}

        {rows.map((row) => (
          <HeatmapRowCells key={row.key} row={row} days={days} today={today} max={max} />
        ))}
      </div>

      <HeatmapLegend />
    </div>
  );
}

function HeatmapRowCells({
  row,
  days,
  today,
  max,
}: {
  row: HeatmapRow;
  days: string[];
  today: string | null | undefined;
  max: number;
}) {
  return (
    <>
      <div
        className={cn(
          "truncate pr-2 text-xs text-label-secondary",
          row.collapsed && "text-label-tertiary",
        )}
        title={row.label}
        data-testid={`heat-row-${row.key}`}
      >
        {row.label}
      </div>
      {days.map((day, index) => {
        const count = row.counts[index] ?? 0;
        const future = isFutureDay(day, today);
        const label = heatCellLabel(row, day, count);
        return (
          <Tooltip key={day}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={label}
                  data-testid={`heat-cell-${row.key}-${day}`}
                  data-level={future ? "future" : levelOf(count, max)}
                  className={cn(
                    // 格高 26、圆角 4（图例 18）。用 rounded-[4px] 而不是语义档：
                    // 最小的 --radius-xs 也是 6，比稿子上这一格更圆。
                    "h-[26px] w-full rounded-[4px] border border-transparent outline-none",
                    "hover:border-label focus-visible:border-2 focus-visible:border-label focus-visible:ring-2 focus-visible:ring-ring",
                    future ? "border-separator bg-heat-future" : LEVEL_BG[levelOf(count, max)],
                  )}
                />
              }
            />
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </>
  );
}

/** 图例：「少 → 多」6 档色块，外加「未到」空格（图例 17）。 */
function HeatmapLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-label-tertiary" data-testid="heat-legend">
      <div className="flex items-center gap-1">
        <span>少</span>
        {LEVEL_BG.map((bg, level) => (
          <span
            key={bg}
            aria-hidden="true"
            data-testid={`heat-legend-${level}`}
            className={cn("h-3 w-3 rounded-sm", bg)}
          />
        ))}
        <span>多</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-3 w-3 rounded-sm border border-separator" />
        <span>未到</span>
      </div>
      <span className="sr-only">{`共 ${HEAT_LEVELS + 1} 档：0 次为中性灰，其余按次数分 1 到 ${HEAT_LEVELS} 档`}</span>
    </div>
  );
}
