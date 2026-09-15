import { LegacyMoocRedirect } from "@/features/mooc/components/legacy-mooc-redirect";
import { notFound } from "next/navigation";

/**
 * 旧地址 `/mooc/:id` → `/notes/{knowledgeBaseId}/mooc/{id}`（F-01「建议重定向」）。
 *
 * 保留而不是删掉：这门课的分享链接已经发出去了。知识库 id 只能从课程数据里得到，
 * 所以真正的跳转在客户端组件里（见 `LegacyMoocRedirect`）。
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const moocId = Number(id);
  if (!Number.isSafeInteger(moocId) || moocId <= 0) notFound();
  return <LegacyMoocRedirect moocId={moocId} />;
}
