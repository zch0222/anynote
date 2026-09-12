import { MobileMoocDetail } from "@/features/mooc/components/mobile/mooc-detail-mobile";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const moocId = Number(id);
  if (!Number.isSafeInteger(moocId) || moocId <= 0) notFound();
  return <MobileMoocDetail moocId={moocId} />;
}
