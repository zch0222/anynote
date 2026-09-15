import { MobileTaskCards } from "@/features/tasks/components/mobile/task-cards-mobile";
import { notFound } from "next/navigation";

/** `/m/notes/[baseId]/tasks`：知识库内的任务 Tab（M-04）。 */
export default async function Page({ params }: { params: Promise<{ baseId: string }> }) {
  const { baseId } = await params;
  const id = Number(baseId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <MobileTaskCards baseId={id} />;
}
