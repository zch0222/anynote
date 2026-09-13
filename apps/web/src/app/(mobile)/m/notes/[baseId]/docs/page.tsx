import { MobileBaseDocs } from "@/features/notes/components/mobile/base-docs-mobile";
import { notFound } from "next/navigation";

/** `/m/notes/[baseId]/docs`：知识库内的资料 Tab（移动端）。 */
export default async function Page({ params }: { params: Promise<{ baseId: string }> }) {
  const { baseId } = await params;
  const id = Number(baseId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <MobileBaseDocs baseId={id} />;
}
