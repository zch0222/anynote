import { TaskFormPage } from "@/features/tasks/components/task-form-page";
import { notFound } from "next/navigation";

/**
 * 新建任务：`/notes/:baseId/tasks/new`（D-18）。
 *
 * `new` 是静态段，Next 的路由优先级让它排在 `[taskId]` 之前，
 * 因此不会被当成"id 为 new 的任务"。
 *
 * 页面不做管理员校验——那要看本库 `permissions`，只有客户端拿得到。
 * 由 `TaskFormPage` 内部判定并回退到任务 Tab（§12.1.1 第 3 点）。
 */
export default async function Page({ params }: { params: Promise<{ baseId: string }> }) {
  const { baseId } = await params;
  const id = Number(baseId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <TaskFormPage baseId={id} mode="new" />;
}
