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
import {
  type MemberTask,
  TASK_STATUS,
  submissionStatusBadgeVariant,
  submissionStatusText,
} from "@/features/tasks/schemas";
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
          <TableHeader>
            <TableRow>
              <TableHead>任务名称</TableHead>
              <TableHead className="w-24">我的状态</TableHead>
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
                  <TableCell className="py-3">
                    <Link
                      href={detailHref}
                      className="block min-w-0 text-[0.9375rem] font-medium text-label outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
                      title={task.taskName ?? ""}
                    >
                      <span className="block truncate">
                        {task.taskName?.trim() || "未命名任务"}
                      </span>
                    </Link>
                    <p className="mt-0.5 text-xs text-label-tertiary">
                      {task.taskCreatorNickname?.trim()
                        ? `${task.taskCreatorNickname} 发布`
                        : "发布人未知"}
                    </p>
                  </TableCell>

                  <TableCell>
                    {badge ? (
                      <Badge variant={badge} data-testid="task-status" data-variant={badge}>
                        {submissionStatusText(task.submissionStatus)}
                      </Badge>
                    ) : null}
                  </TableCell>

                  {/*
                    行内按钮 / 链接要挡住整行命中区，所以自己也要 relative 浮上去。
                    `stopPropagation` 是双保险：命中区靠 z 层（after 伪元素在下方）
                    已经隔开，但事件在 React 树里仍会冒到 `<tr>`，将来谁给行加上
                    onClick 就会"点提交顺带跳详情"。
                  */}
                  <TableCell className="relative text-right">
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
                        查看
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
