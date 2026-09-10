"use client";

import { Skeleton } from "@/components/ui/skeleton";
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
import { ChevronRight, FileText, Library } from "lucide-react";
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
 * 左侧目录：知识库 → 笔记两层结构。
 *
 * 拖拽的语义是「移动到别的知识库」而不是排序——`n_note` 没有排序列，
 * 同库内的顺序无法落库，假装能拖排序只会骗人。
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
      <nav aria-label="笔记目录" className="space-y-1">
        {bases.map((base) => (
          <BaseNode
            key={base.id}
            base={base}
            expanded={base.id === activeBaseId}
            isDragging={draggingNote !== null}
          >
            {isLoading ? (
              <div className="space-y-2 py-1 pl-7">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-4/5" />
              </div>
            ) : notes.length === 0 ? (
              <p className="py-2 pl-7 text-xs text-muted-foreground">还没有笔记</p>
            ) : (
              <ul className="space-y-0.5">
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
          <span className="rounded-md border bg-popover px-2 py-1 text-sm shadow-md">
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
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors",
          expanded ? "bg-muted font-medium" : "hover:bg-muted/60",
          // 拖拽中给所有可放置的知识库一点视觉提示，命中时再加深
          isDragging && !expanded && "ring-1 ring-dashed ring-border",
          isOver && "ring-2 ring-primary",
        )}
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")}
        />
        <Library className="size-4 shrink-0 text-muted-foreground" />
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
        "flex items-center gap-1.5 rounded-md py-1.5 pl-7 pr-2 text-sm transition-colors",
        active ? "bg-primary/10 text-primary" : "hover:bg-muted/60",
        isDragging && "opacity-40",
      )}
      {...listeners}
      {...attributes}
    >
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{note.title}</span>
    </Link>
  );
}
