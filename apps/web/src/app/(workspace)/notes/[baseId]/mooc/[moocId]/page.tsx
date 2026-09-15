import { MoocDetailPage } from "@/features/mooc/components/mooc-detail";
import { notFound } from "next/navigation";

/**
 * 慕课详情：`/notes/:baseId/mooc/:moocId`（D-06）。
 *
 * 取代跨库的 `/mooc/:id`（那条路由现在只做重定向）。页面只解析参数，
 * 取数全在客户端组件里——RSC 取数会挡住路由切换的即时反馈。
 */
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
  return <MoocDetailPage baseId={id} moocId={courseId} />;
}
