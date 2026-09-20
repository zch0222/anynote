"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ProgressBar } from "@/components/loading/progress";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { NotFoundState, QueryError } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatHistoryTime } from "@/features/notes/lib/history-groups";
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
  formatTaskWindow,
  taskPhase,
} from "@/features/tasks/lib/task-window";
import {
  SUBMISSION_TABS,
  type SubmissionTab,
  TASK_STATUS,
  TIMELINE_RETURN,
  type TaskSubmission,
  submissionStatusText,
  taskSubmissionSchema,
} from "@/features/tasks/schemas";
import {
  isTaskMissing,
  useAdminTaskQuery,
  useMemberTaskQuery,
  useTaskSubmissionsQuery,
  useTaskTimelineQuery,
} from "@/features/tasks/use-task-detail";
import { useReturnSubmissionMutation } from "@/features/tasks/use-task-mutations";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, FileText, MoreHorizontal, Undo2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/** 提交面板按需加载（同 M-04：静态引入会顶破 /m/* 的 250KB 预算）。 */
const SubmitTaskSheet = dynamic(
  () => import("./submit-task-sheet").then((mod) => mod.SubmitTaskSheet),
  { ssr: false },
);

/**
 * `/m/notes/[baseId]/tasks/[taskId]`：任务详情（M-12）。
 *
 * 两种视角由**本库权限**决定：`permissions === 1`（管理员）走管理视角，
 * 其余走成员视角。判定依据与桌面 D-17 一致——管理端点本来就会对非管理员
 * 返回 A0301，与其让用户点进去吃一个错误，不如一开始就不给那个入口。
 *
 * 非沉浸式：tab bar 保持可见、`知识库` 高亮（图例 2）。
 */
export function MobileTaskDetail({ baseId, taskId }: { baseId: number; taskId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const isAdmin = base.data?.permissions === 1;

  if (base.isPending) {
    return (
      <MobileScreen title="任务详情" back={`/m/notes/${baseId}/tasks`}>
        <div className="p-4">
          <ListRowsSkeleton count={4} />
        </div>
      </MobileScreen>
    );
  }

  return isAdmin ? (
    <AdminTaskDetail baseId={baseId} taskId={taskId} />
  ) : (
    <MemberTaskDetail baseId={baseId} taskId={taskId} />
  );
}

/* ------------------------------------------------------------------ *
 * 成员视角（M-12 图例 4 – 11）
 * ------------------------------------------------------------------ */

function MemberTaskDetail({ baseId, taskId }: { baseId: number; taskId: number }) {
  const task = useMemberTaskQuery(baseId, taskId);
  const timeline = useTaskTimelineQuery(taskId);
  const [submitting, setSubmitting] = useState(false);
  const now = new Date();

  const backHref = `/m/notes/${baseId}/tasks`;

  if (task.isError) {
    return (
      <MobileScreen title="任务详情" back={backHref}>
        <QueryError
          object="任务"
          error={task.error}
          onRetry={() => void task.refetch()}
          retrying={task.isFetching}
        />
      </MobileScreen>
    );
  }

  // `data === null` = 翻完所有页都没有这个任务（成员侧没有按 id 取单条的端点）
  if (task.data === null) {
    return (
      <MobileScreen title="任务详情" back={backHref}>
        <NotFoundState object="任务" backHref={backHref} backLabel="回到任务" />
      </MobileScreen>
    );
  }

  const row = task.data;
  const status = row?.submissionStatus;
  const phase = taskPhase(row?.startTime, row?.endTime, now);
  const submit = row ? canSubmit(row, now) : false;
  const resubmit = row ? canResubmit(row, now) : false;
  const left = row ? daysLeft(row.endTime, now) : null;

  return (
    <MobileScreen title="任务详情" back={backHref}>
      <div className="space-y-5 p-4 pb-24" data-testid="mobile-task-detail">
        {task.isPending || !row ? (
          <ListRowsSkeleton count={4} />
        ) : (
          <>
            <header className="space-y-2">
              <h2 className="text-title font-semibold text-label" data-testid="task-detail-name">
                {row.taskName?.trim() || "未命名任务"}
              </h2>
              <TaskStatusBadge status={status} />
            </header>

            {/* 图例 6：时间窗口 + 剩余天数（≤3 天 warning，截止后「已截止」） */}
            <div className="space-y-1 text-footnote text-label-secondary">
              <p className="flex items-center gap-1.5">
                <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="tabular">{formatTaskWindow(row.startTime, row.endTime)}</span>
                {left !== null ? (
                  <span
                    data-testid="task-days-left"
                    className={cn(
                      "font-medium",
                      phase === "closed"
                        ? "text-label-tertiary"
                        : left <= DAYS_LEFT_WARNING
                          ? "text-warning"
                          : "text-label-secondary",
                    )}
                  >
                    {daysLeftText(row.endTime, now)}
                  </span>
                ) : null}
              </p>
              {row.taskCreatorNickname?.trim() ? (
                <p className="text-label-tertiary">{row.taskCreatorNickname} 发布</p>
              ) : null}
            </div>

            {/* 图例 7：描述为空整段隐藏 */}
            {row.taskDescribe?.trim() ? (
              <section className="rounded-lg bg-surface p-4" data-testid="task-detail-describe">
                <p className="whitespace-pre-wrap break-words text-body leading-6 text-label">
                  {row.taskDescribe}
                </p>
              </section>
            ) : null}

            {row.submissionNoteId ? (
              <section className="space-y-2" data-testid="task-detail-submission">
                <h3 className="text-footnote font-semibold text-label-secondary">我的提交</h3>
                <MySubmissionRow baseId={baseId} noteId={row.submissionNoteId} />
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-footnote font-semibold text-label-secondary">提交历史</h3>
              {timeline.isPending ? (
                <ListRowsSkeleton count={2} />
              ) : timeline.isError ? (
                <QueryError
                  object="提交历史"
                  error={timeline.error}
                  onRetry={() => void timeline.refetch()}
                  retrying={timeline.isFetching}
                  compact
                />
              ) : (timeline.data?.length ?? 0) === 0 ? (
                <p className="text-footnote text-label-tertiary">还没有提交记录。</p>
              ) : (
                <ol className="space-y-3" data-testid="task-timeline">
                  {timeline.data?.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 size-2.5 shrink-0 rounded-full",
                          item.type === TIMELINE_RETURN ? "bg-danger" : "bg-accent",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-footnote text-label">
                          {item.type === TIMELINE_RETURN ? "被退回" : "已提交"}
                          {item.noteHistoryTitle?.trim() ? ` · ${item.noteHistoryTitle}` : ""}
                        </span>
                        <span className="tabular block text-xs text-label-tertiary">
                          {formatHistoryTime(item.operationTime)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </div>

      {/* 图例 11：贴在 tab bar 上方的主按钮，四态 */}
      <div className="mobile-tabbar-offset fixed inset-x-0 z-20 border-t border-separator bg-surface/95 px-4 py-3 backdrop-blur">
        <Button
          className="min-h-11 w-full"
          disabled={!submit && !resubmit}
          onClick={() => setSubmitting(true)}
          data-testid="task-detail-primary"
        >
          {submit ? "提交" : resubmit ? "重新提交" : phase === "closed" ? "已截止" : "已提交"}
        </Button>
      </div>

      {submitting && row ? (
        <SubmitTaskSheet
          baseId={baseId}
          task={row}
          onOpenChange={(next) => {
            if (!next) setSubmitting(false);
          }}
        />
      ) : null}
    </MobileScreen>
  );
}

/** 我的提交笔记行：标题按需取（成员侧只有 noteId，没有标题）。 */
function MySubmissionRow({ baseId, noteId }: { baseId: number; noteId: number }) {
  const note = useNoteQuery(noteId);
  return (
    <Link
      href={`/m/notes/${baseId}/${noteId}`}
      data-testid="task-submission-note"
      className="flex min-h-[60px] items-center gap-3 rounded-lg bg-surface px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FileText className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-headline text-label">
          {note.data?.title?.trim() || "查看提交的笔记"}
        </span>
        <span className="block truncate text-xs text-label-tertiary">
          编辑 {note.data?.updateTime ? "过的" : "0 次"}
        </span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * 管理员视角（M-12 图例 12 – 16）
 * ------------------------------------------------------------------ */

function AdminTaskDetail({ baseId, taskId }: { baseId: number; taskId: number }) {
  const admin = useAdminTaskQuery(taskId);
  const [tab, setTab] = useState<SubmissionTab>("submitted");
  const [page, setPage] = useState(1);
  const submissions = useTaskSubmissionsQuery(taskId, tab, page);
  const now = new Date();

  const backHref = `/m/notes/${baseId}/tasks`;

  // 不存在 / 无权限都归到不存在态（`isTaskMissing`）
  if (admin.isError && isTaskMissing(admin.error)) {
    return (
      <MobileScreen title="任务详情" back={backHref}>
        <NotFoundState object="任务" backHref={backHref} backLabel="回到任务" />
      </MobileScreen>
    );
  }

  const need = admin.data?.needSubmitCount ?? 0;
  const submitted = admin.data?.submittedCount ?? 0;
  const rate = completionRate(need, submitted);

  return (
    <MobileScreen title="任务详情" back={backHref}>
      <div className="space-y-5 p-4" data-testid="mobile-task-detail-admin">
        {admin.isPending ? (
          <ListRowsSkeleton count={4} />
        ) : admin.isError ? (
          <QueryError
            object="任务"
            error={admin.error}
            onRetry={() => void admin.refetch()}
            retrying={admin.isFetching}
          />
        ) : (
          <>
            <header className="space-y-2">
              <h2 className="text-title font-semibold text-label" data-testid="task-detail-name">
                {admin.data?.taskName?.trim() || "未命名任务"}
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {TASK_PHASE_TEXT[taskPhase(admin.data?.startTime, admin.data?.endTime, now)]}
                </Badge>
                <span className="tabular text-footnote text-label-secondary">
                  {formatTaskWindow(admin.data?.startTime, admin.data?.endTime)}
                </span>
              </div>
            </header>

            {/* 图例 12：进度统计 + 进度条 */}
            <section className="space-y-2 rounded-lg bg-surface p-4" data-testid="task-progress">
              <p className="text-display font-semibold text-label">
                {submitted} / {need} 人已提交
              </p>
              {/* 共享 ProgressBar：label / aria-valuenow / 动态宽度都按统一口径 */}
              <ProgressBar
                value={rate === null ? 0 : Math.round(rate * 100)}
                label="提交进度"
                showValue
                className="[&_[role=progressbar]]:h-1.5"
              />
            </section>

            <Segmented
              label="提交记录筛选"
              shape="pill"
              value={tab}
              onChange={(next) => {
                setTab(next);
                setPage(1);
              }}
              options={SUBMISSION_TABS.map((value) => ({
                value,
                label: TAB_LABELS[value],
              }))}
              className="w-full [&>button]:flex-1"
            />

            {submissions.isPending ? (
              <ListRowsSkeleton count={3} />
            ) : submissions.isError ? (
              <QueryError
                object="提交记录"
                error={submissions.error}
                onRetry={() => void submissions.refetch()}
                retrying={submissions.isFetching}
              />
            ) : (submissions.data?.rows.length ?? 0) === 0 ? (
              <p className="rounded-md border border-dashed border-separator p-6 text-center text-footnote text-label-secondary">
                没有{TAB_LABELS[tab]}的成员。
              </p>
            ) : (
              <ul className="overflow-hidden rounded-lg bg-surface" data-testid="task-submissions">
                {submissions.data?.rows.map((row) => (
                  <li key={row.id} className="border-b border-separator last:border-b-0">
                    <SubmissionRow baseId={baseId} taskId={taskId} row={row} />
                  </li>
                ))}
              </ul>
            )}

            {(submissions.data?.pages ?? 1) > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={page <= 1 || submissions.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  上一页
                </Button>
                <span className="tabular shrink-0 text-xs text-label-secondary">
                  {page} / {submissions.data?.pages ?? 1}
                </span>
                <Button
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={page >= (submissions.data?.pages ?? 1) || submissions.isFetching}
                  onClick={() => setPage((current) => current + 1)}
                >
                  下一页
                </Button>
              </div>
            ) : null}

            {/* 图例 16：移动端只做「看与处理」，编辑留给桌面 */}
            <p className="text-center text-xs text-label-tertiary">
              编辑任务、查看编辑活跃度请使用桌面版。
            </p>
          </>
        )}
      </div>
    </MobileScreen>
  );
}

const TAB_LABELS: Record<SubmissionTab, string> = {
  submitted: "已提交",
  pending: "未提交",
  returned: "已退回",
};

/**
 * 提交行（M-12 图例 14 / 15 / 17）。
 *
 * 整行是 `<Link>`（有笔记时）、「⋯」是兄弟按钮——`<a>` 里不能嵌 `<button>`。
 * 未提交的行没有笔记可打开，所以整行不可点（图例 14 的落点只在有提交时成立）。
 */
function SubmissionRow({
  baseId,
  taskId,
  row,
}: {
  baseId: number;
  taskId: number;
  row: TaskSubmission;
}) {
  const parsed = taskSubmissionSchema.safeParse(row);
  const noteId = parsed.success ? parsed.data.noteId : null;
  const name = row.submissionNickname?.trim() || row.submissionUsername?.trim() || "未命名成员";
  const [actionsOpen, setActionsOpen] = useState(false);
  const returnSubmission = useReturnSubmissionMutation(taskId);
  const router = useRouter();

  const handleReturn = async () => {
    try {
      await returnSubmission.mutateAsync(row.id);
      toast.success("已退回");
      setActionsOpen(false);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  return (
    <div className="flex items-center gap-2 pr-2">
      {noteId ? (
        <Link
          href={`/m/notes/${baseId}/${noteId}`}
          data-testid={`submission-row-${row.id}`}
          className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-0.5 pl-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="truncate text-headline text-label">
            {row.noteTitle?.trim() || "未命名笔记"}
          </span>
          <span className="tabular truncate text-xs text-label-tertiary">
            {name} · {formatHistoryTime(row.submitTime)} 提交
          </span>
        </Link>
      ) : (
        <div className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-0.5 pl-4">
          <span className="truncate text-headline text-label">{name}</span>
          <span className="tabular truncate text-xs text-label-tertiary">
            {row.submitTime ? `${formatHistoryTime(row.submitTime)} 提交` : "还没有提交"}
          </span>
        </div>
      )}

      {/* 只有「已提交」的行才有可退回的提交记录 */}
      {noteId && row.status === 0 ? (
        <button
          type="button"
          aria-label={`${name} 的操作`}
          data-testid={`submission-actions-${row.id}`}
          onClick={() => setActionsOpen(true)}
          className="flex size-11 shrink-0 items-center justify-center text-label-secondary outline-none focus-visible:bg-fill-hover"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      {actionsOpen ? (
        <MobileActionSheet
          open
          onOpenChange={setActionsOpen}
          title={`${name} · ${formatHistoryTime(row.submitTime)} 提交`}
          description="退回后 TA 可以在截止时间之前重新提交。"
          actions={[
            ...(noteId
              ? [
                  {
                    label: "打开笔记",
                    icon: FileText,
                    onSelect: () => router.push(`/m/notes/${baseId}/${noteId}`),
                  },
                ]
              : []),
            {
              label: "退回",
              icon: Undo2,
              destructive: true,
              // 图例 17：连点两次确认——第一次只把标签换成这句
              confirm: "再点一次确认退回",
              onSelect: () => void handleReturn(),
            },
          ]}
        />
      ) : null}
    </div>
  );
}

/** 成员自己的状态徽标（与 M-04 列表同一套变体；2 不显示）。 */
function TaskStatusBadge({ status }: { status: number | null | undefined }) {
  if (status === TASK_STATUS.NOT_SUBMITTED) {
    return <Badge variant="warning">{submissionStatusText(status)}</Badge>;
  }
  if (status === TASK_STATUS.SUBMITTED) {
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3" aria-hidden="true" />
        {submissionStatusText(status)}
      </Badge>
    );
  }
  if (status === TASK_STATUS.RETURNED) {
    return <Badge variant="destructive">{submissionStatusText(status)}</Badge>;
  }
  return null;
}
