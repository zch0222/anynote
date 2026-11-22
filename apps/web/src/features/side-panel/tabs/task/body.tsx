"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { TASK_PHASE_TEXT, formatTaskWindow, taskPhase } from "@/features/tasks/lib/task-window";
import { submissionStatusBadgeVariant, submissionStatusText } from "@/features/tasks/schemas";
import {
  isTaskMissing,
  useAdminTaskQuery,
  useMemberTaskByIdQuery,
} from "@/features/tasks/use-task-detail";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TabHeader } from "../../desktop/tab-header";
import { RESOURCE_TYPE_LABEL } from "../../resource-labels";
import type { TabBodyProps } from "../../types";
import { ResourceError, ResourceUnavailable, resourceMeta, tabHref } from "../shared";

/**
 * 任务正文：任务名、时间窗、阶段与只读描述；提交与管理留在完整页面。
 *
 * @param props 标签记录、导航与端
 * @author 称霸幼儿园
 */
export function TaskTabBody({ record, navigation, variant }: TabBodyProps) {
  const router = useRouter();
  const ref = record.family === "resource" && record.ref.type === "task" ? record.ref : null;
  const base = useKnowledgeBaseQuery(ref?.kbId ?? 0);
  const isAdmin = base.data?.permissions === 1;
  const adminTask = useAdminTaskQuery(ref?.id ?? 0, { enabled: isAdmin === true });
  const memberTask = useMemberTaskByIdQuery(ref?.id ?? 0, { enabled: isAdmin === false });
  const [now] = useState(() => new Date());
  const href = tabHref(record, navigation.locator, variant);

  if (!ref) return <ResourceUnavailable />;
  if (base.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  const task = isAdmin ? adminTask : memberTask;
  const data = task.data;
  if (task.isError) {
    return isTaskMissing(task.error) ? (
      <ResourceUnavailable />
    ) : (
      <div className="p-4">
        <ResourceError onRetry={() => void task.refetch()} retrying={task.isFetching} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  const title = data.taskName?.trim() || "未命名任务";
  const phase = taskPhase(data.startTime, data.endTime, now);
  const status =
    !isAdmin && "submissionStatus" in data ? submissionStatusText(data.submissionStatus) : null;
  const badge =
    !isAdmin && "submissionStatus" in data
      ? submissionStatusBadgeVariant(data.submissionStatus)
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {variant === "desktop" ? (
        <TabHeader
          title={title}
          meta={resourceMeta(base.data?.knowledgeBaseName, RESOURCE_TYPE_LABEL.task)}
          href={href}
          {...(href ? { onOpenFullPage: () => router.push(href) } : {})}
        />
      ) : null}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-label">{title}</h3>
            <Badge variant={phase === "active" ? "default" : "secondary"}>
              {TASK_PHASE_TEXT[phase]}
            </Badge>
            {badge && status ? <Badge variant={badge}>{status}</Badge> : null}
          </div>
          <p className="text-footnote text-label-secondary tabular-nums">
            {formatTaskWindow(data.startTime, data.endTime)}
          </p>
        </div>
        {data.taskDescribe?.trim() ? (
          <div className="rounded-lg border bg-surface p-4">
            <TiptapEditor preset="readonly" value={data.taskDescribe} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
