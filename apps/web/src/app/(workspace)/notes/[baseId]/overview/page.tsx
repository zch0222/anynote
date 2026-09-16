import { KnowledgeBaseOverview } from "@/features/notes/components/knowledge-base-overview";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ baseId: string }> }) {
  const { baseId } = await params;
  const id = Number(baseId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <KnowledgeBaseOverview baseId={id} />;
}
