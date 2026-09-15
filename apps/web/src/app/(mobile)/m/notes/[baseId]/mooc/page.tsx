import { MobileMoocList } from "@/features/mooc/components/mobile/mooc-list-mobile";
import { notFound } from "next/navigation";

/** `/m/notes/[baseId]/mooc`：知识库内的慕课 Tab（M-03）。 */
export default async function Page({ params }: { params: Promise<{ baseId: string }> }) {
  const { baseId } = await params;
  const id = Number(baseId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <MobileMoocList baseId={id} />;
}
