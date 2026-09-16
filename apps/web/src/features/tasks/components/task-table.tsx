"use client";

import { taskDetailHref } from "@/components/layout/navigation";
import { TableSkeleton } from "@/components/loading/skeletons";
import { EmptyState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canResubmit, canSubmit, taskPhase } from "@/features/tasks/lib/task-window";
import { type MemberTask, TASK_STATUS, submissionStatusBadgeVariant, submissionStatusText } from "@/features/tasks/schemas";
import { formatDateRange, formatMonthDayTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { ListTodo } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SubmitTaskDialog } from "./submit-task-dialog";

export type TaskTableProps = {
  baseId: number;
  tasks: MemberTask[];
  loading: boolean;
};

/** 时间窗口文案：任一端缺失回退 `—`，不让空串把单元格撑成 0 宽。 */
function formatTaskWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  return formatDateRange(start, end) || "—";
}

/**
 * 提交时间文案（D-07 图例 16）：只有真提交过才有时间。
 *
 * `submitTime` 为空但状态是「已提交」的情况在生产里出现过（历史数据缺字段），
 * 那时显示 `—` 而不是空白——空白会让用户以为这一列坏了。
 */
function formatSubmitTime(task: MemberTask): string {
  if (task.submissionStatus === TASK_STATUS.NO_SUBMISSION_REQUIRED) return "—";
  return formatMonthDayTime(task.submitTime) || "—";
}

/**
 * 任务列表（D-07 图例 10 / 14 / 16 / 18）。
 *
 * 手写 `<Table>` 而不是 `@tanstack/react-table`：设计稿这张表没有排序、
 * 没有列宽调整、没有分组，筛选是**整表级**的（页头的分段控件），
 * 用 react-table 只会为一份列表多背一整套表格解析器。
 *
 * 整行可点靠「名称单元格里的 Link + `after:inset-0`」实现，而不是把
 * `onClick` 挂在 `<tr>` 上——后者键盘和读屏都到不了，图例 10 要求可点
 * 同时还要保证可达性。
 */
export function TaskTable({ baseId, tasks, loading }: TaskTableProps) {
  const [submitting, setSubmitting] = useState<MemberTask | null>(null);
  // "此刻"在同一帧里取一次，保证所有行的时间状态基于同一个时刻
  const now = new Date();

  if (loading) {
    return <TableSkeleton rows={4} />;
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={ListTodo}
        title="这个知识库下还没有任务"
        hint="任务由知识库管理员发布。"
        data-testid="task-empty"
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl bg-surface shadow-card" data-testid="task-table">
        <Table>
          {/*
            六列（D-07 图例实测）：任务名称 / 描述 / 时间窗口 / 我的状态 / 提交时间 / 操作。
            原实现只有三列（任务名称 / 我的状态 / 操作），把「发布人」折进名称行、
            把「描述」「时间窗口」「提交时间」整个省掉——那张表看不出这个任务
            "什么时候截止""要交什么""我什么时候交的"，只剩一个状态徽标。
            列宽按画板量出的比例给定值，名称列吃剩余宽度。
          */}
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">任务名称</TableHead>
              <TableHead className="min-w-[220px]">描述</TableHead>
              <TableHead className="w-[190px]">时间窗口</TableHead>
              <TableHead className="w-24">我的状态</TableHead>
              <TableHead className="w-28">提交时间</TableHead>
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => {
              const phase = taskPhase(task.startTime, task.endTime, now);
              const badge = submissionStatusBadgeVariant(task.submissionStatus);
              const detailHref = taskDetailHref(baseId, task.id);
              const submit = canSubmit(task, now);
              const resubmit = canResubmit(task, now);
              // 2 = 无需提交（本库管理员自己）：不出徽标也不出操作
              const noAction = task.submissionStatus === TASK_STATUS.NO_SUBMISSION_REQUIRED;

              return (
                <TableRow key={task.id} className="relative" data-testid={`task-row-${task.id}`}>
                  <TableCell className="py-3 align-top">
                    <Link
                      href={detailHref}
                      className="block min-w-0 text-[0.9375rem] font-medium text-label outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      title={task.taskName ?? ""}
                    >
                      <span className="block truncate">
                        {task.taskName?.trim() || "未命名任务"}
                      </span>
                    </Link>
                    {/* 图例：发布人在名称下方一行小字 */}
                    <p className="mt-0.5 text-xs text-label-tertiary">
                      {task.taskCreatorNickname?.trim()
                        ? `${task.taskCreatorNickname} 发布`
                        : "发布人未知"}
                    </p>
                  </TableCell>

                  {/*
                    描述列：最多两行（画板原文"最多两行"）。用 `line-clamp-2`
                    而不是固定行高——长描述截断、短描述不留空，两种都不至于把行撑歪。
                  */}
                  <TableCell className="align-top">
                    <span className="line-clamp-2 text-footnote text-label-secondary">
                      {task.taskDescribe?.trim() || "—"}
                    </span>
                  </TableCell>

                  {/* 时间窗口：`2026-09-10 ~ 2026-09-18`（含年份、波浪号而非 en dash） */}
                  <TableCell className="align-top">
                    <span className="tabular whitespace-nowrap text-footnote text-label-secondary">
                      {formatTaskWindow(task.startTime, task.endTime)}
                    </span>
                  </TableCell>

                  <TableCell className="align-top">
                    {badge ? (
                      <Badge variant={badge} data-testid="task-status" data-variant={badge}>
                        {submissionStatusText(task.submissionStatus)}
                      </Badge>
                    ) : null}
                  </TableCell>

                  {/* 提交时间：未提交时画板给的是「—」而不是留空 */}
                  <TableCell className="align-top">
                    <span className="tabular whitespace-nowrap text-footnote text-label-tertiary">
                      {formatSubmitTime(task)}
                    </span>
                  </TableCell>

                  {/*
                    行内按钮 / 链接要挡住整行命中区，所以自己也要 relative 浮上去。
                    `stopPropagation` 是双保险：命中区靠 z 层（after 伪元素在下方）
                    已经隔开，但事件在 React 树里仍会冒到 `<tr>`，将来谁给行加上
                    onClick 就会"点提交顺带跳详情"。
                  */}
                  <TableCell className="relative text-right align-top">
                    {noAction ? null : submit ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="relative"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSubmitting(task);
                        }}
                        data-testid={`task-submit-${task.id}`}
                      >
                        提交
                      </Button>
                    ) : resubmit ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="relative"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSubmitting(task);
                        }}
                        data-testid={`task-resubmit-${task.id}`}
                      >
                        重新提交
                      </Button>
                    ) : task.submissionStatus === TASK_STATUS.SUBMITTED ? (
                      /*
                       * §1.4 第 3 条：已提交且未截止时后端会拒绝再次提交
                       * （"你已经提交过该任务"），所以这里只给一个去详情的入口，
                       * 不出任何提交类按钮。要改必须管理员先退回。
                       */
                      <Link
                        href={detailHref}
                        className={cn(
                          "relative text-footnote font-medium text-accent outline-none",
                          "hover:underline focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        data-testid={`task-view-${task.id}`}
                      >
                        查看 ›
                      </Link>
                    ) : phase === "closed" ? (
                      <span className="text-footnote text-label-tertiary">已截止</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {submitting ? (
        <SubmitTaskDialog
          baseId={baseId}
          task={submitting}
          onOpenChange={(open) => {
            if (!open) {
              setSubmitting(null);
            }
          }}
        />
      ) : null}
    </>
  );
}
