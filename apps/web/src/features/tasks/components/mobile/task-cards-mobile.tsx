"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { type MemberTask, isTaskOpen, submissionStatusText } from "@/features/tasks/schemas";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { ChevronDown, ListTodo } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * 提交对话框只在点"提交笔记"时才用得上，却会连带拉进笔记列表查询、知识库选择器
 * 与 dropdown-menu。静态引入时 `/m/tasks` 首屏 247.7KB，离 250KB 预算只剩 2.3KB，
 * 任何后续改动都会把它顶破——改成按需加载。
 */
const SubmitTaskDialog = dynamic(
  () =>
    import("@/features/tasks/components/submit-task-dialog").then((mod) => mod.SubmitTaskDialog),
  { ssr: false },
);

/** 状态筛选项；`null` 表示不筛。取值与后端 MemberNoteTaskStatusEnum 对齐。 */
const STATUS_FILTERS = [
  { label: "全部", value: null },
  { label: "未提交", value: 0 },
  { label: "已提交", value: 1 },
  { label: "已退回", value: 2 },
] as const;

const statusVariant: Record<string, "secondary" | "outline" | "destructive"> = {
  已提交: "secondary",
  未提交: "outline",
  已退回: "destructive",
};

/**
 * `/m/tasks`：任务卡片列表。
 *
 * 桌面用 `@tanstack/react-table` 摊成五列表格，在 375px 下必然横向溢出；
 * 移动端改成卡片，并且**不引入 react-table**——它只为表格语义服务，
 * 卡片用不上，却会占掉移动端 250KB 预算里的一大块（方案 D6 / D8）。
 *
 * 数据、提交对话框、状态文案全部复用既有实现。
 */
export function MobileTaskCards() {
  const bases = useKnowledgeBasesQuery();
  const [baseId, setBaseId] = useState<number | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<MemberTask | null>(null);
  const tasks = useTasksQuery(baseId ?? 0);

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (baseId === null && firstBase) {
      setBaseId(firstBase.id);
    }
  }, [firstBase, baseId]);

  const currentBase = bases.data?.find((base) => base.id === baseId);
  const rows = (tasks.data?.rows ?? []).filter(
    (task) => status === null || task.submissionStatus === status,
  );
  const statusLabel = STATUS_FILTERS.find((item) => item.value === status)?.label ?? "全部";

  return (
    <MobileScreen
      title="任务"
      toolbar={
        <div className="flex items-center gap-2">
          <MobileActionSheet
            title="选择知识库"
            description="任务挂在知识库下，先选一个库。"
            actions={(bases.data ?? []).map((base) => ({
              label: base.knowledgeBaseName ?? "未命名知识库",
              onSelect: () => setBaseId(base.id),
            }))}
            trigger={
              <Button variant="outline" className="min-h-10 flex-1 justify-between">
                <span className="truncate">{currentBase?.knowledgeBaseName ?? "选择知识库"}</span>
                <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
              </Button>
            }
          />
          <MobileActionSheet
            title="按状态筛选"
            actions={STATUS_FILTERS.map((item) => ({
              label: item.label,
              onSelect: () => setStatus(item.value),
            }))}
            trigger={
              <Button variant="outline" className="min-h-10 shrink-0" data-testid="task-filter">
                {statusLabel}
              </Button>
            }
          />
        </div>
      }
    >
      <div className="space-y-3 p-4" data-testid="mobile-tasks">
        {!baseId ? (
          <EmptyBox
            title={bases.isPending ? "正在加载知识库" : "还没有可用的知识库"}
            hint="任务挂在知识库下，先到笔记页创建一个。"
          />
        ) : tasks.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : tasks.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            任务加载失败：{tasks.error.message}
          </p>
        ) : rows.length === 0 ? (
          <EmptyBox
            title={status === null ? "这个知识库还没有任务" : `没有${statusLabel}的任务`}
            hint={status === null ? "任务由知识库管理者发布。" : "换个筛选条件看看。"}
          />
        ) : (
          rows.map((task) => {
            const text = submissionStatusText(task.submissionStatus);
            const open = isTaskOpen(task.endTime);
            return (
              <article
                key={task.id}
                className="space-y-2 rounded-xl border bg-card p-4"
                data-testid={`task-card-${task.id}`}
              >
                <div className="flex items-start gap-2">
                  <h2 className="min-w-0 flex-1 text-sm font-medium">
                    {task.taskName ?? "未命名任务"}
                  </h2>
                  <Badge variant={statusVariant[text] ?? "outline"} data-testid="task-status">
                    {text}
                  </Badge>
                </div>
                {task.taskDescribe?.trim() ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{task.taskDescribe}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {(task.startTime ?? "").slice(0, 10) || "?"} ~{" "}
                  {(task.endTime ?? "").slice(0, 10) || "?"}
                  {open ? "" : "（已截止）"}
                </p>
                <Button
                  variant="outline"
                  className="min-h-10 w-full"
                  disabled={!open}
                  onClick={() => setSubmitting(task)}
                  data-testid={`task-submit-${task.id}`}
                >
                  {task.submissionStatus === 1 ? "重新提交" : "提交笔记"}
                </Button>
              </article>
            );
          })
        )}
      </div>

      {submitting ? (
        <SubmitTaskDialog
          task={submitting}
          onOpenChange={(next) => {
            if (!next) setSubmitting(null);
          }}
        />
      ) : null}
    </MobileScreen>
  );
}

function EmptyBox({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center">
      <ListTodo className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
