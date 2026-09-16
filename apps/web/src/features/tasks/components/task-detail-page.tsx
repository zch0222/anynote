"use client";

import { taskEditHref } from "@/components/layout/navigation";
import { ProgressBar } from "@/components/loading/progress";
import { ListRowsSkeleton, PanelSkeleton } from "@/components/loading/skeletons";
import { NotFoundState, QueryError } from "@/components/shared/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNoteQuery } from "@/features/notes/use-note";
import {
  DAYS_LEFT_WARNING,
  TASK_PHASE_TEXT,
  canResubmit,
  canSubmit,
  completionRate,
  daysLeft,
  daysLeftText,
  formatRate,
  formatTaskMoment,
  formatTaskWindow,
  taskPhase,
} from "@/features/tasks/lib/task-window";
import {
  SUBMISSION_TABS,
  type SubmissionTab,
  TIMELINE_RETURN,
  TIMELINE_SUBMIT,
  type TaskSubmission,
  submissionDisplayName,
  submissionStatusBadgeVariant,
  submissionStatusText,
} from "@/features/tasks/schemas";
import {
  isTaskMissing,
  useAdminTaskQuery,
  useMemberTaskQuery,
  useTaskSubmissionsQuery,
  useTaskTimelineQuery,
} from "@/features/tasks/use-task-detail";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { ChevronLeft, FileText, MoreHorizontal, Pencil } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { TaskHeatmap } from "./task-heatmap";

/*
 * 两个对话框都按需加载：它们只在点击后才出现，且各自带着一份笔记/成员列表查询的
 * 依赖；静态引入会把它们压进任务详情的首屏（这条路由本来就贴着预算）。
 * `ssr: false`：对话框在服务端渲染没有意义。
 */
const SubmitTaskDialog = dynamic(
  () => import("./submit-task-dialog").then((mod) => mod.SubmitTaskDialog),
  { ssr: false },
);
const ReturnSubmissionDialog = dynamic(
  () => import("./return-submission-dialog").then((mod) => mod.ReturnSubmissionDialog),
  { ssr: false },
);

/*
 * 只读正文按需加载：TipTap 整包（含 Shiki、KaTeX 桥接）是重依赖，
 * 静态引入会把它压进任务详情的首屏 JS（仓库禁止清单里明确要求 dynamic）。
 */
const TiptapEditor = dynamic(
  () => import("@/components/editor/TiptapEditor").then((mod) => mod.TiptapEditor),
  { ssr: false, loading: () => <Skeleton className="h-24 w-full rounded-md" /> },
);

/** 提交记录分段控件（图例 11）：文案 → tab 值。 */
const TAB_LABELS: Record<SubmissionTab, string> = {
  submitted: "已提交",
  pending: "未提交",
  returned: "已退回",
};

/**
 * 任务详情（`/notes/[baseId]/tasks/[taskId]`，D-17）。
 *
 * 视角按本库权限分流：`permissions === 1` 走管理员视角（统计 + 提交记录 +
 * 热力图），其余走成员视角（只看自己的提交与时间线）。后端两个视角用的是
 * 不同端点（管理员 `/admin/noteTasks/{id}`，成员从 `/noteTasks` 列表里找），
 * 权限不够时管理员端点会直接拒绝，所以这个分流不能只做视觉上的隐藏。
 */
export function TaskDetailPage({ baseId, taskId }: { baseId: number; taskId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const isAdmin = base.data?.permissions === 1;

  // 权限未知时先不渲染任何视角：先按成员视角画出来再切成管理员视角，
  // 会让页面明显闪一下，也会白打一次成员列表请求
  if (base.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-1">
        <PanelSkeleton />
      </div>
    );
  }

  return isAdmin ? (
    <AdminTaskDetail baseId={baseId} taskId={taskId} />
  ) : (
    <MemberTaskDetail baseId={baseId} taskId={taskId} />
  );
}

/* ------------------------------------------------------------------ *
 * 管理员视角（图例 1–19）
 * ------------------------------------------------------------------ */

function AdminTaskDetail({ baseId, taskId }: { baseId: number; taskId: number }) {
  const task = useAdminTaskQuery(taskId);
  // 发布人昵称只在成员列表行里有（AdminNoteTaskVO 没这个字段，图例 5）
  const memberRow = useMemberTaskQuery(baseId, taskId);
  // 已截止仍可退回，所以"此刻"取一次给退回对话框的文案用
  const [now] = useState(() => new Date());
  const [tab, setTab] = useState<SubmissionTab>("submitted");
  const [page, setPage] = useState(1);
  const [returning, setReturning] = useState<TaskSubmission | null>(null);

  /*
   * 三个 tab 各来一条查询（图例 11 的计数取各自的 `total`）。
   *
   * 只有当前 tab 跟着 `page` 走，另外两条固定第 1 页——它们存在的意义
   * 只是那个 `total`，把页码也传进去会随翻页白发请求。
   * 代价是首屏三条并行请求，但三者都命中同一个后端端点、参数只差 status，
   * 换来的是"切 tab 不再等一次骨架"。
   */
  const submittedQ = useTaskSubmissionsQuery(taskId, "submitted", tab === "submitted" ? page : 1);
  const pendingQ = useTaskSubmissionsQuery(taskId, "pending", tab === "pending" ? page : 1);
  const returnedQ = useTaskSubmissionsQuery(taskId, "returned", tab === "returned" ? page : 1);
  const byTab = { submitted: submittedQ, pending: pendingQ, returned: returnedQ } as const;
  const submissions = byTab[tab];
  const countOf = (key: SubmissionTab) => byTab[key].data?.total;

  if (task.isError) {
    if (isTaskMissing(task.error)) {
      return (
        <NotFoundState object="任务" backHref={`/notes/${baseId}/tasks`} backLabel="回到任务" />
      );
    }
    return (
      <QueryError
        object="任务"
        message={toUserMessage(task.error)}
        onRetry={() => void task.refetch()}
        retrying={task.isFetching}
      />
    );
  }

  if (task.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-1">
        <PanelSkeleton />
      </div>
    );
  }

  const data = task.data;
  const phase = taskPhase(data.startTime, data.endTime, now);
  const creator = memberRow.data?.taskCreatorNickname?.trim();
  const days = daysLeftText(data.endTime, now);
  const rate = completionRate(data.needSubmitCount, data.submittedCount);
  const need = data.needSubmitCount ?? 0;
  const submitted = data.submittedCount ?? 0;
  const closed = phase === "closed";

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5" data-testid="task-detail-admin">
      <header className="space-y-3">
        <Link
          href={`/notes/${baseId}/tasks`}
          className="inline-flex items-center gap-1 text-footnote text-label-secondary outline-none hover:text-label focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> 任务
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-display text-label">{data.taskName?.trim() || "未命名任务"}</h1>
              <Badge
                variant={phase === "active" ? "default" : "secondary"}
                data-testid="task-phase"
              >
                {TASK_PHASE_TEXT[phase]}
              </Badge>
            </div>
            <p className="flex items-center gap-1.5 text-footnote text-label-secondary">
              <Avatar className="size-5">
                <AvatarFallback className="text-[0.625rem]">
                  {(creator || "任").slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              {creator ? `${creator} 发布` : "发布人未知"}
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatTaskWindow(data.startTime, data.endTime)}</span>
              {days ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      !closed && (daysLeftWarning(data.endTime, now) ? "text-warning" : undefined),
                    )}
                    data-testid="task-days-left"
                  >
                    {days}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <Button
            variant="outline"
            render={<Link href={taskEditHref(baseId, taskId)} />}
            data-testid="task-edit"
          >
            <Pencil className="size-4" aria-hidden="true" />
            编辑任务
          </Button>
        </div>
      </header>

      {/*
        统计区（图例 7 / 8）：画板是**三张独立白卡**（中间有间隙），不是一张卡里切三格。
        原来是 `grid … rounded-lg bg-surface p-5 shadow-card sm:grid-cols-3`——
        单卡承载三个 `space-y-1` 分组，卡间没有间隙，视觉上是一栏而不是三张卡。

        「应提交 / 已提交」的单位是**人**（画板 `12 人` / `8 人`），不是抽象计数：
        任务面向的是成员，裸数字会被读成"12 个任务"。
        完成率卡按画板：`67%` 与 `8 / 12` **同一行**，进度条在下方通栏。
      */}
      <section className="grid gap-4 sm:grid-cols-3" data-testid="task-stats">
        <Stat label="应提交" value={need} unit="人" testId="task-need" />
        <Stat label="已提交" value={submitted} unit="人" testId="task-submitted" />
        <div className="space-y-3 rounded-lg bg-surface p-5 shadow-card">
          <p className="text-xs text-label-secondary">完成率</p>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-2xl font-semibold text-label tabular-nums" data-testid="task-rate">
              {formatRate(rate)}
            </p>
            <p className="text-footnote text-label-tertiary tabular-nums">
              {submitted} / {need}
            </p>
          </div>
          <ProgressBar
            value={rate === null ? 0 : rate * 100}
            label="提交完成率"
            showValue={false}
          />
        </div>
      </section>

      {/* 描述为空时整卡隐藏（图例 9） */}
      {data.taskDescribe?.trim() ? (
        <section className="rounded-lg bg-surface p-5 shadow-card" data-testid="task-describe">
          <TiptapEditor preset="readonly" value={data.taskDescribe} />
        </section>
      ) : null}

      <section className="space-y-3 rounded-lg bg-surface p-5 shadow-card">
        <h2 className="text-[0.9375rem] font-semibold text-label">提交记录</h2>
        <Segmented
          label="提交状态"
          value={tab}
          onChange={(next) => {
            setTab(next);
            // 换 tab 回到第一页：留在第 3 页会让新 tab 直接显示空列表
            setPage(1);
          }}
          options={SUBMISSION_TABS.map((value) => {
            const count = countOf(value);
            return {
              value,
              // 计数还没到时不硬编 0——"已退回 0"会被读成"一份都没有"
              label: count === undefined ? TAB_LABELS[value] : `${TAB_LABELS[value]} ${count}`,
            };
          })}
        />

        {submissions.isPending ? (
          <ListRowsSkeleton count={3} />
        ) : submissions.isError ? (
          <QueryError
            object="提交记录"
            message={toUserMessage(submissions.error)}
            onRetry={() => void submissions.refetch()}
            retrying={submissions.isFetching}
          />
        ) : submissions.data.rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-separator p-6 text-center text-footnote text-label-secondary">
            这个列表还是空的。
          </p>
        ) : (
          <ul className="divide-y divide-separator" data-testid="submission-list">
            {submissions.data.rows.map((row) => (
              <SubmissionRow
                key={row.id}
                baseId={baseId}
                row={row}
                // 「未提交」列表只有昵称与用户名，没有 to 的地方（图例 12）
                clickable={tab !== "pending"}
                onReturn={tab === "submitted" ? () => setReturning(row) : undefined}
              />
            ))}
          </ul>
        )}

        {submissions.data && submissions.data.pages > 1 ? (
          <Pager
            page={page}
            pages={submissions.data.pages}
            total={submissions.data.total}
            onChange={setPage}
          />
        ) : null}
      </section>

      <TaskHeatmap taskId={taskId} />

      <ReturnSubmissionDialog
        open={returning !== null}
        onOpenChange={(open) => {
          if (!open) setReturning(null);
        }}
        submission={returning}
        endTime={data.endTime}
        now={now}
      />
    </section>
  );
}

/**
 * 剩余 ≤ 3 天转 warning（图例 5）。
 *
 * 直接问 `daysLeft` 而不是回头去正则解析 `daysLeftText` 的产物——
 * 那种"把渲染结果再解析回来"的写法会在文案改一个字（"还剩"→"剩余"）时
 * 静默失效，而它的失效形态是"warning 颜色不出现"，没人会注意到。
 */
function daysLeftWarning(endTime: string | null | undefined, now: Date): boolean {
  const days = daysLeft(endTime, now);
  return days !== null && days <= DAYS_LEFT_WARNING;
}

/** 统计卡（D-17 图例 7 / 8）：三张独立白卡，数值带单位。 */
function Stat({
  label,
  value,
  unit,
  testId,
}: {
  label: string;
  value: number;
  unit?: string;
  testId: string;
}) {
  return (
    <div className="space-y-1 rounded-lg bg-surface p-5 shadow-card">
      <p className="text-xs text-label-secondary">{label}</p>
      <p className="text-2xl font-semibold text-label tabular-nums" data-testid={testId}>
        {value}
        {unit ? (
          <span className="ml-1 text-footnote font-normal text-label-secondary">{unit}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * 一行提交记录（图例 12 / 13 / 14）。
 *
 * 已提交 / 已退回的行整行可点到笔记，地址用**任务的 knowledgeBaseId**
 * 拼（§1.4 第 1 条：后端强制笔记与任务同库，不需要后端补字段）。
 * 「未提交」行只有昵称与用户名，没有笔记可点。
 */
function SubmissionRow({
  baseId,
  row,
  clickable,
  onReturn,
}: {
  baseId: number;
  row: TaskSubmission;
  clickable: boolean;
  onReturn?: (() => void) | undefined;
}) {
  const name = submissionDisplayName(row);
  const username = row.submissionUsername?.trim();
  // 时间用绝对时刻而不是「3 天前」：表格里逐行比对"谁什么时候交的"时，
  // 相对时间读不出先后，而且会让同行渲染结果随当前时刻变化。
  const meta = [
    row.submitTime ? `${formatTaskMoment(row.submitTime)} 提交` : null,
    typeof row.noteEditCount === "number" ? `编辑 ${row.noteEditCount} 次` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li
      // `group/row` 是给 ⋯ 按钮用的：图例 14 要求它悬停才出现。
      // 只用 CSS `group-hover` 而不是 JS 状态：JS 版本要么在移动端永远不显示
      // （没有 hover），要么得额外补 focus / touch 分支。
      className="group/row relative flex min-h-[60px] items-center gap-2 py-2"
      data-testid={`submission-row-${row.id}`}
    >
      <FileText className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {clickable && row.noteId ? (
          <>
            <Link
              href={`/notes/${baseId}/${row.noteId}`}
              className="block truncate text-[0.9375rem] text-label outline-none after:absolute after:inset-0 focus-visible:underline"
            >
              {row.noteTitle?.trim() || "未命名笔记"}
            </Link>
            <p className="mt-0.5 truncate text-xs text-label-tertiary">
              {name}
              {meta ? ` · ${meta}` : ""}
            </p>
          </>
        ) : (
          <>
            <span className="block truncate text-[0.9375rem] text-label">{name}</span>
            <p className="mt-0.5 truncate text-xs text-label-tertiary">
              {username || "没有用户名"}
            </p>
          </>
        )}
      </div>

      {onReturn ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                // 悬停整行时出现；但键盘聚焦时也必须可见（否则 Tab 到了一个看不见的按钮），
                // 所以再叠一条 `focus-visible:opacity-100`。
                className="relative opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100"
                aria-label={`${name} 的提交操作`}
                data-testid={`submission-menu-${row.id}`}
              />
            }
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* 菜单头是「谁 · 什么时候交的」（图例 14）。
                Base UI 的 GroupLabel 必须在 Group 里，所以整段包一层。 */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {name} · {row.submitTime ? formatTaskMoment(row.submitTime) : "已提交"}
              </DropdownMenuLabel>
              {row.noteId ? (
                <DropdownMenuItem
                  render={<Link href={`/notes/${baseId}/${row.noteId}`} />}
                  data-testid={`submission-open-${row.id}`}
                >
                  打开笔记
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                variant="destructive"
                onClick={onReturn}
                data-testid={`submission-return-${row.id}`}
              >
                退回
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}

function Pager({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      <p className="text-xs text-label-tertiary tabular-nums">
        共 {total} 条 · 第 {page} / {pages} 页
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="xs" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          上一页
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 成员视角（图例 20 / 21）
 * ------------------------------------------------------------------ */

function MemberTaskDetail({ baseId, taskId }: { baseId: number; taskId: number }) {
  const task = useMemberTaskQuery(baseId, taskId);
  const timeline = useTaskTimelineQuery(taskId);
  const [now] = useState(() => new Date());
  const [submitting, setSubmitting] = useState(false);
  // 有提交才去查笔记标题；没有 submissionNoteId 时不打这个请求
  const noteId = task.data?.submissionNoteId ?? 0;

  if (task.isError) {
    return (
      <QueryError
        object="任务"
        message={toUserMessage(task.error)}
        onRetry={() => void task.refetch()}
        retrying={task.isFetching}
      />
    );
  }

  if (task.isPending) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4 p-1">
        <PanelSkeleton />
      </div>
    );
  }

  // 逐页翻完仍没有 → 不存在（图例 22 / 23）
  if (!task.data) {
    return <NotFoundState object="任务" backHref={`/notes/${baseId}/tasks`} backLabel="回到任务" />;
  }

  const data = task.data;
  const phase = taskPhase(data.startTime, data.endTime, now);
  const submit = canSubmit(data, now);
  const resubmit = canResubmit(data, now);
  const badge = submissionStatusBadgeVariant(data.submissionStatus);

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5" data-testid="task-detail-member">
      <header className="space-y-3">
        <Link
          href={`/notes/${baseId}/tasks`}
          className="inline-flex items-center gap-1 text-footnote text-label-secondary outline-none hover:text-label focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> 任务
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-display text-label">{data.taskName?.trim() || "未命名任务"}</h1>
              {badge ? (
                <Badge variant={badge} data-testid="member-task-status">
                  {submissionStatusText(data.submissionStatus)}
                </Badge>
              ) : null}
            </div>
            <p className="text-footnote text-label-secondary tabular-nums">
              {formatTaskWindow(data.startTime, data.endTime)}
              {daysLeftText(data.endTime, now) ? ` · ${daysLeftText(data.endTime, now)}` : ""}
            </p>
          </div>
          <MemberAction
            phase={phase}
            submit={submit}
            resubmit={resubmit}
            onSubmit={() => setSubmitting(true)}
          />
        </div>
      </header>

      {data.taskDescribe?.trim() ? (
        <section className="rounded-lg bg-surface p-5 shadow-card" data-testid="task-describe">
          <TiptapEditor preset="readonly" value={data.taskDescribe} />
        </section>
      ) : null}

      <MySubmission baseId={baseId} noteId={noteId} />

      <section className="space-y-3 rounded-lg bg-surface p-5 shadow-card">
        <h2 className="text-[0.9375rem] font-semibold text-label">我的提交</h2>
        {timeline.isPending ? (
          <ListRowsSkeleton count={2} />
        ) : timeline.isError ? (
          <QueryError
            object="提交历史"
            message={toUserMessage(timeline.error)}
            onRetry={() => void timeline.refetch()}
            retrying={timeline.isFetching}
          />
        ) : timeline.data.length === 0 ? (
          <p className="text-footnote text-label-secondary">还没有提交记录。</p>
        ) : (
          <ol className="space-y-2" data-testid="task-timeline">
            {timeline.data.map((item) => {
              const returned = item.type === TIMELINE_RETURN;
              return (
                <li key={item.id} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2.5 shrink-0 rounded-full",
                      returned ? "bg-danger" : "bg-accent",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] text-label">
                      {returned ? "提交被退回" : "提交了任务"}
                    </p>
                    <p className="text-xs text-label-tertiary tabular-nums">
                      {formatTaskMoment(item.operationTime)}
                      {TIMELINE_SUBMIT === item.type && item.noteHistoryTitle
                        ? ` · ${item.noteHistoryTitle}`
                        : ""}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {submitting ? (
        <SubmitTaskDialog
          baseId={baseId}
          task={data}
          onOpenChange={(open) => {
            if (!open) setSubmitting(false);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * 页头主按钮四态（图例 20 / 21）：
 * 可提交 →「提交」· 可重新提交 →「重新提交」· 已提交 →「已提交」禁用 · 截止 →「已截止」禁用。
 */
function MemberAction({
  phase,
  submit,
  resubmit,
  onSubmit,
}: {
  phase: ReturnType<typeof taskPhase>;
  submit: boolean;
  resubmit: boolean;
  onSubmit: () => void;
}) {
  if (submit || resubmit) {
    return (
      <Button onClick={onSubmit} data-testid="member-action">
        {resubmit ? "重新提交" : "提交"}
      </Button>
    );
  }
  const disabled = phase === "closed" ? "已截止" : "已提交";
  return (
    <Button variant="outline" disabled data-testid="member-action">
      {disabled}
    </Button>
  );
}

/** 「我的提交」笔记行（图例 20）：标题取 `useNoteQuery(submissionNoteId)`。 */
function MySubmission({ baseId, noteId }: { baseId: number; noteId: number }) {
  const note = useNoteQuery(noteId);

  if (!Number.isSafeInteger(noteId) || noteId <= 0) {
    return null;
  }

  return (
    <section className="space-y-2 rounded-lg bg-surface p-5 shadow-card">
      <h2 className="text-footnote font-semibold text-label-secondary">我的提交</h2>
      {note.isPending ? (
        <ListRowsSkeleton count={1} />
      ) : (
        <Link
          href={`/notes/${baseId}/${noteId}`}
          className="flex min-h-[60px] items-center gap-2 text-[0.9375rem] font-medium text-label outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="my-submission-note"
        >
          <FileText className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
          <span className="truncate">{note.data?.title?.trim() || "未命名笔记"}</span>
        </Link>
      )}
    </section>
  );
}
