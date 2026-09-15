import { MobileMoocDetail } from "@/features/mooc/components/mobile/mooc-detail-mobile";
import { notFound } from "next/navigation";

/** 慕课详情（移动端，M-06）：`/m/notes/:baseId/mooc/:moocId`。 */
export default async function Page({
  params,
}: {
  params: Promise<{ baseId: string; moocId: string }>;
}) {
  const { baseId, moocId } = await params;
  const id = Number(baseId);
  const courseId = Number(moocId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  if (!Number.isSafeInteger(courseId) || courseId <= 0) notFound();
  return <MobileMoocDetail baseId={id} moocId={courseId} />;
}
