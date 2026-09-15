import { MobileTaskDetail } from "@/features/tasks/components/mobile/task-detail-mobile";
import { notFound } from "next/navigation";

/** 任务详情（移动端，M-12）：`/m/notes/:baseId/tasks/:taskId`，非沉浸式。 */
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
  return <MobileTaskDetail baseId={id} taskId={task} />;
}
