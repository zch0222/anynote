import { TaskDetailPage } from "@/features/tasks/components/task-detail-page";
import { notFound } from "next/navigation";

/** 任务详情：`/notes/:baseId/tasks/:taskId`（D-17）。 */
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
  return <TaskDetailPage baseId={id} taskId={task} />;
}
