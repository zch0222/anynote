import { MobileWikiReader } from "@/features/wikis/components/mobile/wiki-reader-mobile";
import { notFound } from "next/navigation";

export default async function Page({
  params,
}: {
  params: Promise<{ baseId: string; noteId: string }>;
}) {
  const { baseId, noteId } = await params;
  const base = Number(baseId);
  const note = Number(noteId);
  if (!Number.isSafeInteger(base) || base <= 0) notFound();
  if (!Number.isSafeInteger(note) || note <= 0) notFound();
  return <MobileWikiReader baseId={base} noteId={note} />;
}
