"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { MobileBaseHeader } from "@/features/notes/components/mobile/base-section-tabs";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { canResubmit, canSubmit, formatTaskWindowShort } from "@/features/tasks/lib/task-window";
import {
  type MemberTask,
  TASK_STATUS,
  submissionStatusBadgeVariant,
  submissionStatusText,
} from "@/features/tasks/schemas";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { mobileTaskDetailHref } from "@/lib/mobile/hrefs";
import { ListTodo } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

/**
 * 提交面板只在点"提交"时才用得上，却会连带拉进笔记列表查询、知识库查询与 Sheet。
 * 静态引入时 `/m/tasks` 首屏 247.7KB，离 250KB 预算只剩 2.3KB，
 * 任何后续改动都会把它顶破——继续按需加载（12.7.3 要点 2）。
 */
const SubmitTaskSheet = dynamic(
  () => import("./submit-task-sheet").then((mod) => mod.SubmitTaskSheet),
  { ssr: false },
);

/** 状态筛选项；`null` 表示不筛。取值与后端 `UserNoteTaskStatus` 对齐。 */
const STATUS_FILTERS = [
  { key: "all", label: "全部", value: null },
  { key: "todo", label: "未提交", value: TASK_STATUS.NOT_SUBMITTED },
  { key: "returned", label: "已退回", value: TASK_STATUS.RETURNED },
  { key: "done", label: "已提交", value: TASK_STATUS.SUBMITTED },
] as const;

type FilterKey = (typeof STATUS_FILTERS)[number]["key"];

/**
 * `/m/notes/[baseId]/tasks`：知识库内的「任务」Tab（M-04）。
 *
 * 旧实现渲染的是**跨库**任务列表（顶栏「任务」+ 知识库选择器 + 状态动作表），
 * 默认落在第一个库而不是当前库。现在收回知识库：`baseId` 由路由给，
 * 状态筛选平铺成全宽 `Segmented`（少一次点击），行尾按钮收窄到 32 高。
 *
 * 状态语义（§1.4 第 2、3 条）：
 * - `3` 才是「已退回」，`2` 是「无需提交」（本库管理员自己）；
 * - **已提交的任务只出 accent 文字「查看」**，不出任何提交类按钮——
 *   后端拒绝重复提交，旧实现那个「重新提交」点了必失败。
 */
export function MobileTaskCards({ baseId }: { baseId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [submitting, setSubmitting] = useState<MemberTask | null>(null);
  const tasks = useTasksQuery(baseId);
  const now = new Date();

  const rows = tasks.data?.rows ?? [];
  const active = STATUS_FILTERS.find((item) => item.key === filter) ?? STATUS_FILTERS[0];
  const filtered = rows.filter(
    (task) => active.value === null || task.submissionStatus === active.value,
  );
  const countOf = (value: number | null) =>
    value === null ? rows.length : rows.filter((task) => task.submissionStatus === value).length;

  return (
    <MobileScreen
      title={base.data?.knowledgeBaseName?.trim() || "任务"}
      back="/m/notes"
      tone="paper"
    >
      <div className="space-y-4 pb-4" data-testid="mobile-tasks">
        {/* 只有全部/未提交/已退回/已提交四格，计数取全量、不随筛选变 */}
        <MobileBaseHeader baseId={baseId} current="tasks" />

        <div className="space-y-3 px-4">
          <Segmented
            label="按状态筛选"
            shape="pill"
            value={filter}
            onChange={setFilter}
            options={STATUS_FILTERS.map((item) => ({
              value: item.key,
              label: `${item.label} ${countOf(item.value)}`,
            }))}
            className="w-full [&>button]:flex-1"
          />

          {tasks.isPending ? (
            <ListRowsSkeleton count={3} />
          ) : tasks.isError ? (
            <QueryError
              object="任务"
              error={tasks.error}
              onRetry={() => void tasks.refetch()}
              retrying={tasks.isFetching}
            />
          ) : filtered.length === 0 ? (
            rows.length === 0 ? (
              <EmptyState
                icon={ListTodo}
                title="这个知识库下还没有任务"
                hint="任务由知识库管理员发布。"
              />
            ) : (
              <EmptyState
                title={`没有${active.label}的任务`}
                hint="换个筛选条件看看。"
                action={
                  <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                    查看全部
                  </Button>
                }
              />
            )
          ) : (
            <ul className="overflow-hidden rounded-lg bg-surface" data-testid="mobile-task-items">
              {filtered.map((task) => (
                <li key={task.id} className="border-b border-separator last:border-b-0">
                  <TaskRow
                    baseId={baseId}
                    task={task}
                    now={now}
                    onOpenSubmit={() => setSubmitting(task)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {submitting ? (
        <SubmitTaskSheet
          baseId={baseId}
          task={submitting}
          onOpenChange={(next) => {
            if (!next) setSubmitting(null);
          }}
        />
      ) : null}
    </MobileScreen>
  );
}

/**
 * 任务行（M-04 图例 3 / 5 / 8 / 10）。
 *
 * 整行是 `<Link>`，行尾按钮是**独立的 button** 而不是嵌在链接里——
 * HTML 不允许 `<a>` 套 `<button>`，浏览器会把它拆开，点击行为随机。
 * 两者是兄弟节点，按钮的点击不会冒泡到链接（不同分支）。
 */
function TaskRow({
  baseId,
  task,
  now,
  onOpenSubmit,
}: {
  baseId: number;
  task: MemberTask;
  now: Date;
  onOpenSubmit: () => void;
}) {
  const status = task.submissionStatus;
  /* 图例 5：2（无需提交，本库管理员自己）返回 null，这一行不画徽标 */
  const variant = submissionStatusBadgeVariant(status);
  const href = mobileTaskDetailHref(baseId, task.id);
  const submit = canSubmit(task, now);
  const resubmit = canResubmit(task, now);
  const submitted = !submit && !resubmit && status === TASK_STATUS.SUBMITTED;

  return (
    <div className="flex items-center gap-2 py-4 pr-2">
      <Link
        href={href}
        data-testid={`task-card-${task.id}`}
        className="flex min-w-0 flex-1 flex-col gap-1.5 pl-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-headline text-label">
            {task.taskName?.trim() || "未命名任务"}
          </span>
          {variant ? (
            <Badge variant={variant} data-testid="task-status">
              {submissionStatusText(status)}
            </Badge>
          ) : null}
        </span>
        {/*
          H-10：画板行内是「描述（最多两行）」再「时间窗口 · 发布人」。
          原实现只有时间窗口，**没有描述也没有发布人**——而"这个任务要我交什么"
          正是列表上最该先看到的一句；发布人则决定了"我该去问谁"。
          两者列表端点都已返回（`taskDescribe` / `taskCreatorNickname`），不是造数差异。
        */}
        {task.taskDescribe?.trim() ? (
          <span className="line-clamp-2 text-footnote text-label-secondary">
            {task.taskDescribe}
          </span>
        ) : null}
        <span className="tabular truncate text-xs text-label-tertiary">
          {formatTaskWindowShort(task.startTime, task.endTime)}
          {task.taskCreatorNickname?.trim() ? ` · ${task.taskCreatorNickname}发布` : ""}
        </span>
      </Link>

      {/* 行尾动作区：点击不触发行跳转（两者是兄弟节点，不共用一个链接） */}
      <div className="flex shrink-0 items-center">
        {submit || resubmit ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onOpenSubmit}
            data-testid={`task-submit-${task.id}`}
          >
            {resubmit ? "重新提交" : "提交"}
          </Button>
        ) : submitted ? (
          <Link
            href={href}
            data-testid={`task-view-${task.id}`}
            className="flex min-h-11 items-center px-2 text-footnote font-medium text-accent outline-none focus-visible:underline"
          >
            查看
          </Link>
        ) : null}
      </div>
    </div>
  );
}
