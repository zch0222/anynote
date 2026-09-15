import { LegacyMoocRedirect } from "@/features/mooc/components/legacy-mooc-redirect";
import { notFound } from "next/navigation";

/**
 * 旧地址 `/m/mooc/:id` → `/m/notes/{knowledgeBaseId}/mooc/{id}`（F-02 规则 R）。
 *
 * 与桌面 `/mooc/:id` 同一套补救：旧书签仍然可用，但要落回知识库上下文，
 * 否则 tab bar 不点亮任何一格、返回键也回不到本库。
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const moocId = Number(id);
  if (!Number.isSafeInteger(moocId) || moocId <= 0) notFound();
  return <LegacyMoocRedirect moocId={moocId} variant="mobile" />;
}
