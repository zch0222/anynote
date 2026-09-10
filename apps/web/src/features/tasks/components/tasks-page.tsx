"use client";

import { KnowledgeBaseSelect } from "@/components/shared/knowledge-base-select";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { TaskTable } from "@/features/tasks/components/task-table";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { ListTodo } from "lucide-react";
import { useEffect, useState } from "react";

/** `/tasks`：知识库选择 + 任务表格（@tanstack/react-table）。 */
export function TasksPage() {
  const bases = useKnowledgeBasesQuery();
  const [baseId, setBaseId] = useState<number | null>(null);
  const tasks = useTasksQuery(baseId ?? 0);

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (baseId === null && firstBase) {
      setBaseId(firstBase.id);
    }
  }, [firstBase, baseId]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">任务</h1>
          <p className="text-sm text-muted-foreground">把想法拆成行动，让计划逐步实现。</p>
        </div>
        <KnowledgeBaseSelect bases={bases.data ?? []} value={baseId} onChange={setBaseId} />
      </div>

      {!baseId ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <ListTodo className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">还没有可用的知识库</p>
          <p className="mt-1 text-sm text-muted-foreground">
            任务挂在知识库下，先到笔记页创建一个。
          </p>
        </div>
      ) : tasks.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          任务加载失败：{tasks.error.message}
        </p>
      ) : (
        <TaskTable tasks={tasks.data?.rows ?? []} loading={tasks.isPending} />
      )}
    </section>
  );
}
