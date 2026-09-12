import { MobilePdfDetail } from "@/features/ai/components/mobile/pdf-detail-mobile";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const id = Number(docId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <MobilePdfDetail docId={id} />;
}
