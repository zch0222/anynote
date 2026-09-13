"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { coverAvatarClassName } from "@/features/notes/lib/cover-gradient";
import { cn } from "@/lib/utils";
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type NoteTreeBase = { id: number; name: string };
export type NoteTreeNote = { id: number; title: string };

export type NoteTreeProps = {
  bases: NoteTreeBase[];
  /** 当前展开的知识库；只有它会加载并展示笔记。 */
  activeBaseId: number;
  activeNoteId?: number | undefined;
  notes: NoteTreeNote[];
  isLoading?: boolean;
  /** 把笔记拖到另一个知识库上时触发。 */
  onMoveNote?: (input: { noteId: number; knowledgeBaseId: number }) => void;
};

/**
 * 编辑器左侧目录：知识库 → 笔记两层结构。
 *
 * 拖拽的语义是「移动到别的知识库」而不是排序——`n_note` 没有排序列，
 * 同库内的顺序无法落库，假装能拖排序只会骗人。
 *
 * 版式对齐设计稿：知识库行是**展开态的主行**（渐变缩略图 + 名称 + 折叠箭头），
 * 笔记行缩进挂在它下面，当前笔记用 accent 底色标出。
 */
export function NoteTree(props: NoteTreeProps) {
  const { bases, activeBaseId, activeNoteId, notes, isLoading, onMoveNote } = props;
  const [draggingNote, setDraggingNote] = useState<NoteTreeNote | null>(null);
  // 按下后移动 6px 才判定为拖拽，否则普通点击会被吞掉
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragStart(event: DragStartEvent) {
    const note = notes.find((item) => item.id === Number(event.active.id));
    setDraggingNote(note ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingNote(null);
    const targetBaseId = Number(event.over?.id ?? Number.NaN);
    const noteId = Number(event.active.id);
    if (!Number.isFinite(targetBaseId) || targetBaseId === activeBaseId) return;
    onMoveNote?.({ noteId, knowledgeBaseId: targetBaseId });
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingNote(null)}
    >
      <nav aria-label="笔记目录" className="space-y-0.5">
        {bases.map((base) => (
          <BaseNode
            key={base.id}
            base={base}
            expanded={base.id === activeBaseId}
            isDragging={draggingNote !== null}
          >
            {isLoading ? (
              <div className="space-y-1.5 py-1 pl-8" aria-busy="true">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-4/5" />
              </div>
            ) : notes.length === 0 ? (
              <p className="py-1.5 pl-8 text-xs text-label-tertiary">还没有笔记</p>
            ) : (
              <ul className="space-y-px">
                {notes.map((note) => (
                  <li key={note.id}>
                    <NoteNode
                      note={note}
                      baseId={base.id}
                      active={note.id === activeNoteId}
                      draggable={bases.length > 1}
                    />
                  </li>
                ))}
              </ul>
            )}
          </BaseNode>
        ))}
      </nav>
      <DragOverlay>
        {draggingNote ? (
          <span className="rounded-md bg-elevated px-2 py-1 text-footnote text-label shadow-popover">
            {draggingNote.title}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BaseNode({
  base,
  expanded,
  isDragging,
  children,
}: {
  base: NoteTreeBase;
  expanded: boolean;
  isDragging: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: base.id, disabled: expanded });
  return (
    <div ref={setNodeRef} data-testid={`note-tree-base-${base.id}`}>
      <Link
        href={`/notes/${base.id}`}
        aria-current={expanded ? "true" : undefined}
        className={cn(
          "flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-footnote transition-colors",
          expanded ? "bg-grouped font-medium text-label" : "text-label hover:bg-grouped/60",
          // 拖拽中给所有可放置的知识库一点视觉提示，命中时再加深
          isDragging && !expanded && "ring-1 ring-dashed ring-separator",
          isOver && "ring-2 ring-accent",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-label-tertiary transition-transform",
            expanded && "rotate-90",
          )}
          aria-hidden="true"
        />
        <span className={coverAvatarClassName(base.id, "size-4 rounded-xs")} aria-hidden="true" />
        <span className="truncate">{base.name}</span>
      </Link>
      {expanded ? <div className="mt-0.5">{children}</div> : null}
    </div>
  );
}

function NoteNode({
  note,
  baseId,
  active,
  draggable,
}: {
  note: NoteTreeNote;
  baseId: number;
  active: boolean;
  draggable: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: note.id,
    disabled: !draggable,
  });
  return (
    <Link
      ref={setNodeRef}
      href={`/notes/${baseId}/${note.id}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-8 items-center gap-2 rounded-md py-1.5 pl-8 pr-2 text-footnote transition-colors",
        active ? "bg-accent-soft font-medium text-accent" : "text-label-secondary hover:bg-grouped",
        isDragging && "opacity-40",
      )}
      {...listeners}
      {...attributes}
    >
      <FileText className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{note.title}</span>
    </Link>
  );
}
