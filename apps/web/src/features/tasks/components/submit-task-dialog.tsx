"use client";

import { KnowledgeBaseSelect } from "@/components/shared/knowledge-base-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE } from "@/features/notes/schemas";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import type { MemberTask } from "@/features/tasks/schemas";
import { useSubmitTaskMutation } from "@/features/tasks/use-tasks";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** 提交任务：选择知识库下的一篇笔记作为任务成果。 */
export function SubmitTaskDialog({
  task,
  onOpenChange,
}: {
  task: MemberTask;
  onOpenChange: (open: boolean) => void;
}) {
  const bases = useKnowledgeBasesQuery();
  const [baseId, setBaseId] = useState<number | null>(null);
  const [noteId, setNoteId] = useState<number | null>(null);
  const notes = useNotesQuery({
    knowledgeBaseId: baseId ?? 0,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const submit = useSubmitTaskMutation();

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (baseId === null && firstBase) {
      setBaseId(firstBase.id);
    }
  }, [firstBase, baseId]);

  const handleSubmit = async () => {
    if (!noteId) {
      toast.error("请选择要提交的笔记");
      return;
    }
    try {
      await submit.mutateAsync({ noteId, noteTaskId: task.id });
      toast.success("任务已提交");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交失败，请稍后重试");
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>提交任务「{task.taskName ?? "未命名任务"}」</DialogTitle>
          <DialogDescription>选择一篇笔记作为任务成果提交。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">知识库</p>
            <KnowledgeBaseSelect
              bases={bases.data ?? []}
              value={baseId}
              onChange={(id) => {
                setBaseId(id);
                setNoteId(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">笔记</p>
            {notes.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : notes.isError ? (
              <p className="text-sm text-destructive">笔记加载失败：{notes.error.message}</p>
            ) : notes.data.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">这个知识库下还没有笔记。</p>
            ) : (
              <div
                className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1"
                data-testid="submit-note-list"
              >
                {notes.data.rows.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors ${
                      noteId === note.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                    }`}
                    onClick={() => {
                      setNoteId(note.id);
                    }}
                    data-testid={`submit-note-${note.id}`}
                  >
                    {noteId === note.id ? (
                      <Loader2 className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{note.title ?? "未命名笔记"}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submit.isPending || !noteId}
            data-testid="submit-task-confirm"
          >
            {submit.isPending ? "提交中…" : "提交"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
