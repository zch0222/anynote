import { MobileNoteEditor } from "@/features/notes/components/mobile/note-editor-mobile";
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
  // key 挂 noteId：切到另一篇笔记时强制重挂载，让 useSaveNote 的卸载清理
  // 先把上一篇的待存改动 flush 出去，再开始编辑新的（与桌面同一处理）
  return <MobileNoteEditor key={note} baseId={base} noteId={note} />;
}
