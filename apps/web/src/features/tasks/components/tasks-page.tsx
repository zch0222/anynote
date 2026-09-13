"use client";

import { KnowledgeBaseSelect } from "@/components/shared/knowledge-base-select";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { TaskTable } from "@/features/tasks/components/task-table";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { ListTodo } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 任务列表。
 *
 * 两种用法与 `MoocPage` 一致：知识库内（`/notes/:id/tasks`）由路由给定 `baseId`，
 * 跨库（`/tasks`）退回知识库选择器。
 */
export function TasksPage({ baseId: fixedBaseId }: { baseId?: number | undefined } = {}) {
  const bases = useKnowledgeBasesQuery();
  const [pickedBaseId, setPickedBaseId] = useState<number | null>(null);
  const baseId = fixedBaseId ?? pickedBaseId;
  const tasks = useTasksQuery(baseId ?? 0);

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (fixedBaseId === undefined && pickedBaseId === null && firstBase) {
      setPickedBaseId(firstBase.id);
    }
  }, [fixedBaseId, firstBase, pickedBaseId]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-title text-label">任务</h1>
          <p className="text-footnote text-label-secondary">把想法拆成行动，让计划逐步实现。</p>
        </div>
        {fixedBaseId === undefined ? (
          <KnowledgeBaseSelect bases={bases.data ?? []} value={baseId} onChange={setPickedBaseId} />
        ) : null}
      </div>

      {!baseId ? (
        <div className="rounded-lg border border-dashed border-separator p-10 text-center">
          <ListTodo className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
          <p className="mt-3 text-headline text-label">还没有可用的知识库</p>
          <p className="mt-1 text-footnote text-label-secondary">
            任务挂在知识库下，先创建一个知识库。
          </p>
        </div>
      ) : tasks.isError ? (
        <p role="alert" className="rounded-lg bg-danger/5 p-6 text-footnote text-danger">
          任务加载失败：{tasks.error.message}
        </p>
      ) : (
        <TaskTable tasks={tasks.data?.rows ?? []} loading={tasks.isPending} />
      )}
    </section>
  );
}
