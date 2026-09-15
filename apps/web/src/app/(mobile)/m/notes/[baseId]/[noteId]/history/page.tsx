import { MobileNoteHistory } from "@/features/notes/components/mobile/note-history-mobile";
import { notFound } from "next/navigation";

/**
 * 笔记历史版本（移动端，M-13）：`/m/notes/:baseId/:noteId/history`。
 *
 * 沉浸式：列表 → 版本页在同一路由内用 `?v={operationId}` 切换，
 * 所以这里不需要第二段路由，返回键的行为由组件自己接管。
 */
export default async function Page({
  params,
}: {
  params: Promise<{ baseId: string; noteId: string }>;
}) {
  const { baseId, noteId } = await params;
  const id = Number(baseId);
  const note = Number(noteId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  if (!Number.isSafeInteger(note) || note <= 0) notFound();
  return <MobileNoteHistory baseId={id} noteId={note} />;
}
