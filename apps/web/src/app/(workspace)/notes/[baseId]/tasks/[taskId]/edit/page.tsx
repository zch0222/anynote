import { TaskFormPage } from "@/features/tasks/components/task-form-page";
import { notFound } from "next/navigation";

/** 编辑任务：`/notes/:baseId/tasks/:taskId/edit`（D-18 的编辑模式）。 */
export default async function Page({
  params,
}: {
  params: Promise<{ baseId: string; taskId: string }>;
}) {
  const { baseId, taskId } = await params;
  const id = Number(baseId);
  const task = Number(taskId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  if (!Number.isSafeInteger(task) || task <= 0) notFound();
  return <TaskFormPage baseId={id} taskId={task} mode="edit" />;
}
