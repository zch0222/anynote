"use client";

import { Spinner } from "@/components/loading/spinner";
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
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import type { MemberTask } from "@/features/tasks/schemas";
import { useSubmitTaskMutation } from "@/features/tasks/use-tasks";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Check, Library } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * 提交任务（D-07 ①，图例 29 / 32）。
 *
 * **知识库不能选**（§1.4 第 1 条）：后端强制"提交的笔记必须与任务同库"
 * （`NoteTaskServiceImpl.java:346-348`，否则报「笔记和任务不属于一个知识库」），
 * 所以这里只把任务所在库显示成一行只读信息。
 * 笔记地址与查询都用路由给的 `baseId` / 任务的 `knowledgeBaseId`，不需要后端补字段。
 *
 * 重新提交时默认选中上次提交的那篇（`submissionNoteId`）：
 * "被退回了想改一改再交"是最常见的路径，让用户重新找一遍笔记是白费功夫。
 */
export function SubmitTaskDialog({
  baseId,
  task,
  onOpenChange,
}: {
  baseId: number;
  task: MemberTask;
  onOpenChange: (open: boolean) => void;
}) {
  // 上一次提交的笔记；没有就是首次提交
  const [noteId, setNoteId] = useState<number | null>(task.submissionNoteId ?? null);
  const base = useKnowledgeBaseQuery(baseId);
  const notes = useNotesQuery({
    knowledgeBaseId: baseId,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const submit = useSubmitTaskMutation();

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
      toast.error(toUserMessage(error));
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>提交任务「{task.taskName?.trim() || "未命名任务"}」</DialogTitle>
          <DialogDescription>选择一篇笔记作为任务成果提交。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">知识库</p>
            {/*
             * 只读行而不是选择器：可切换的库会诱导用户选错，
             * 提交时才吃一个"笔记和任务不属于一个知识库"的错误。
             */}
            <div
              className="flex h-8 items-center gap-1.5 rounded-md bg-fill-hover px-3 text-footnote text-label-secondary"
              data-testid="submit-base-readonly"
            >
              <Library className="size-3.5 shrink-0" aria-hidden="true" />
              {base.isPending ? (
                <Skeleton className="h-3.5 w-24" />
              ) : (
                <>
                  <span className="truncate">
                    {base.data?.knowledgeBaseName?.trim() || "未命名知识库"}
                  </span>
                  <span className="shrink-0 text-label-tertiary">· 任务所在库</span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">笔记</p>
            {notes.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : notes.isError ? (
              <p role="alert" className="text-sm text-danger">
                笔记加载失败：{toUserMessage(notes.error)}
              </p>
            ) : notes.data.rows.length === 0 ? (
              <p className="text-sm text-label-secondary">
                这个知识库下还没有笔记，先写一篇再来提交。
              </p>
            ) : (
              <div
                className="max-h-56 space-y-1 overflow-y-auto rounded-md p-1"
                data-testid="submit-note-list"
              >
                {notes.data.rows.map((note) => {
                  const selected = noteId === note.id;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors",
                        "focus-visible:ring-2 focus-visible:ring-ring",
                        selected ? "bg-accent-soft font-medium text-accent" : "hover:bg-fill-hover",
                      )}
                      onClick={() => {
                        setNoteId(note.id);
                      }}
                      data-testid={`submit-note-${note.id}`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {note.title?.trim() || "未命名笔记"}
                      </span>
                      {/*
                       * 选中用右侧对勾，不用转圈：转圈在同一个位置出现时
                       * 会被读成"这一条正在加载"（图例 32 记录的问题）。
                       */}
                      {selected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
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
            {submit.isPending ? (
              <>
                <Spinner size="button" aria-hidden="true" />
                提交中…
              </>
            ) : (
              "提交"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
