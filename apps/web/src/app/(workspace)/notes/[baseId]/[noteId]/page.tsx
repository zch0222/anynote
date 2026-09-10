import { NoteEditor } from "@/features/notes/components/note-editor";
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
  // key 挂 noteId：在目录里切到另一篇笔记时强制重挂载，
  // 让 useSaveNote 的卸载清理先把上一篇的待存改动 flush 出去，再开始编辑新的
  return <NoteEditor key={note} baseId={base} noteId={note} />;
}
