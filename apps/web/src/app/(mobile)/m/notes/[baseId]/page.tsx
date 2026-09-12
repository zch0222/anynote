import { MobileNoteList } from "@/features/notes/components/mobile/note-list-mobile";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ baseId: string }> }) {
  const { baseId } = await params;
  const id = Number(baseId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return <MobileNoteList baseId={id} />;
}
