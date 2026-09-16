"use client";

import { taskNewHref } from "@/components/layout/navigation";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import {
  KB_CONTENT_COLUMN,
  KnowledgeBasePageHeader,
} from "@/features/notes/components/knowledge-base-page-header";
import { TaskTable } from "@/features/tasks/components/task-table";
import { canResubmit, canSubmit } from "@/features/tasks/lib/task-window";
import { type MemberTask, TASK_STATUS } from "@/features/tasks/schemas";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { ListTodo, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/** 状态筛选：全部 / 未提交 / 已退回 / 已提交（D-07 图例 7）。 */
const FILTERS = [
  { value: "all", label: "全部" },
  { value: "pending", label: "未提交", status: TASK_STATUS.NOT_SUBMITTED },
  { value: "returned", label: "已退回", status: TASK_STATUS.RETURNED },
  { value: "submitted", label: "已提交", status: TASK_STATUS.SUBMITTED },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

/**
 * 知识库「任务」Tab（`/notes/[baseId]/tasks`，D-07）。
 *
 * `baseId` 必填：任务只属于知识库（2026-09-15 拍板），跨库的 `/tasks` 已经
 * 重定向到 `/notes`，所以这里不再有知识库选择器与「默认第一个库」的兜底。
 *
 * 状态筛选是**纯本地过滤**（图例 7）：整库任务一次取回（`pageSize=50` 与
 * 列表页同一口径），切换 tab 不发请求，也就不需要在筛选态下画骨架。
 */
export function TasksPage({ baseId }: { baseId: number }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const base = useKnowledgeBaseQuery(baseId);
  const tasks = useTasksQuery(baseId);
  const now = new Date();

  const rows = tasks.data?.rows ?? [];
  const isAdmin = base.data?.permissions === 1;
  // 「待你提交」= 能提交或能重新提交的行数（图例：页头副标题）
  const todoCount = rows.filter((task) => canSubmit(task, now) || canResubmit(task, now)).length;
  const countOf = (status: number) =>
    rows.filter((task) => task.submissionStatus === status).length;

  const visible = filter === "all" ? rows : filterRows(rows, filter);

  return (
    <section className={cn(KB_CONTENT_COLUMN, "space-y-5")} data-testid="tasks-page">
      <KnowledgeBasePageHeader
        title="任务"
        subtitle={
          tasks.isPending
            ? "正在加载任务…"
            : rows.length > 0
              ? `${rows.length} 个任务 · ${todoCount} 个待你提交`
              : isAdmin
                ? "发布一个任务，让本库成员在时间窗口内提交笔记。"
                : "任务由知识库管理员发布。"
        }
        actions={
          isAdmin ? (
            <Button render={<Link href={taskNewHref(baseId)} />} data-testid="task-create">
              <Plus className="size-4" aria-hidden="true" />
              新建任务
            </Button>
          ) : null
        }
      />

      {tasks.isPending ? (
        <ListRowsSkeleton count={3} />
      ) : tasks.isError ? (
        <QueryError
          object="任务"
          message={toUserMessage(tasks.error)}
          onRetry={() => void tasks.refetch()}
          retrying={tasks.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="这个知识库下还没有任务"
          hint={isAdmin ? "发布一个任务试试。" : "任务由知识库管理员发布。"}
        />
      ) : (
        <>
          {/*
            筛选行（D-07 图例 7）：分段控件在左，右端一行说明「任务由知识库管理员发布」。
            说明**恒在**（不再只在成员视角出现）：它解释的是"这些任务从哪来"，
            对管理员同样是有效信息——管理员看到的列表里也有别人发的任务。
          */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="任务状态"
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((item) => ({
                value: item.value,
                label:
                  item.value === "all"
                    ? `全部 ${rows.length}`
                    : `${item.label} ${countOf(item.status)}`,
              }))}
            />
            <p className="text-footnote text-label-tertiary">任务由知识库管理员发布</p>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              title={`没有${labelOf(filter)}的任务`}
              hint="换个筛选条件看看。"
              action={
                <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                  查看全部
                </Button>
              }
            />
          ) : (
            <TaskTable baseId={baseId} tasks={visible} loading={false} />
          )}
        </>
      )}
    </section>
  );
}

function filterRows(rows: readonly MemberTask[], filter: FilterValue): MemberTask[] {
  const target = FILTERS.find((item) => item.value === filter);
  if (!target || !("status" in target)) return [...rows];
  return rows.filter((task) => task.submissionStatus === target.status);
}

function labelOf(filter: FilterValue): string {
  return FILTERS.find((item) => item.value === filter)?.label ?? "";
}
