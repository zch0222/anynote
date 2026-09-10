import { MoocDetailPage } from "@/features/mooc/components/mooc-detail";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const moocId = Number(id);
  if (!Number.isSafeInteger(moocId) || moocId <= 0) {
    notFound();
  }
  return <MoocDetailPage moocId={moocId} />;
}
