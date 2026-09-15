import { NoteHistoryPage } from "@/features/notes/components/note-history-page";
import { notFound } from "next/navigation";

/**
 * 笔记历史版本：`/notes/:baseId/:noteId/history`（D-16）。
 *
 * 放在知识库上下文里（2026-09-15 拍板：从知识库里的笔记页进入），
 * 所以侧栏的「笔记」与目录里的当前项都能保持高亮——两段 id 天然满足
 * `isBaseActive` 与 `parseNoteIdFromPath` 的判定。
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
  return <NoteHistoryPage baseId={id} noteId={note} />;
}
