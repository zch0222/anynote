"use client";

import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DEFAULT_PAGE_SIZE } from "@/features/notes/schemas";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import type { MemberTask } from "@/features/tasks/schemas";
import { useSubmitTaskMutation } from "@/features/tasks/use-tasks";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Check, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type SubmitTaskSheetProps = {
  /** 任务所在的知识库 id：笔记与任务必须同库（§1.4 第 1 条），所以从路由拿。 */
  baseId: number;
  task: MemberTask;
  onOpenChange: (open: boolean) => void;
};

/**
 * 提交任务底部面板（M-04 图例 12 – 13）。
 *
 * 取代桌面那个居中 `SubmitTaskDialog`：手机上对话框会被软键盘顶掉一半，
 * 列表也只剩两三行可选。这里改成底部 Sheet——顶部圆角 20 + 把手，
 * 内容区自己滚动。
 *
 * 与桌面版的两个语义差别（都对后端事实）：
 * 1. **知识库是只读行**。后端强制笔记与任务同库（`NoteTaskServiceImpl.java:346`），
 *    桌面那个可切换的 `KnowledgeBaseSelect` 是错的：切换后提交必然失败。
 * 2. **已提交的任务不该出现在这里**。后端拒绝重复提交，入口由调用方按
 *    `canSubmit` / `canResubmit` 控制。
 *
 * 这个组件由 `task-cards-mobile.tsx` 与 `task-detail-mobile.tsx` 通过
 * `dynamic(..., { ssr: false })` 引入——它连带拉进笔记列表查询与 Sheet，
 * 静态引入会顶破 `/m/*` 的 250KB 首屏预算。
 */
export function SubmitTaskSheet({ baseId, task, onOpenChange }: SubmitTaskSheetProps) {
  const base = useKnowledgeBaseQuery(baseId);
  const notes = useNotesQuery({ knowledgeBaseId: baseId, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  const submit = useSubmitTaskMutation();
  /** 重新提交时默认选中上次提交的那篇笔记，少点一次。 */
  const [noteId, setNoteId] = useState<number | null>(task.submissionNoteId ?? null);

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
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[80svh] rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)]"
        data-testid="submit-task-sheet"
      >
        {/* 把手：底部面板的固定形态，也是"可以往下拖"的提示 */}
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-separator"
        />
        <SheetHeader>
          <SheetTitle>提交任务</SheetTitle>
          <SheetDescription>
            {task.taskName?.trim() || "未命名任务"} · 选一篇笔记作为成果
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4">
          {/* 图例 13：知识库只读行，48 高，固定为任务所在库 */}
          <div className="flex min-h-12 items-center gap-3 rounded-lg bg-fill-hover px-3">
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-label-tertiary">知识库 · 任务所在库</span>
              <span className="block truncate text-footnote text-label">
                {base.data?.knowledgeBaseName?.trim() || "加载中…"}
              </span>
            </span>
          </div>

          <div className="space-y-1.5">
            <p className="text-footnote font-medium text-label">笔记</p>
            {notes.isPending ? (
              <ListRowsSkeleton count={3} />
            ) : notes.isError ? (
              <QueryError
                object="笔记"
                error={notes.error}
                onRetry={() => void notes.refetch()}
                retrying={notes.isFetching}
              />
            ) : notes.data.rows.length === 0 ? (
              <p className="rounded-md border border-dashed border-separator p-4 text-center text-footnote text-label-secondary">
                这个知识库下还没有笔记。先去新建一篇，再回来提交。
              </p>
            ) : (
              <ul
                className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-separator p-1"
                data-testid="submit-note-list"
              >
                {notes.data.rows.map((note) => {
                  const selected = noteId === note.id;
                  return (
                    <li key={note.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setNoteId(note.id)}
                        data-testid={`submit-note-${note.id}`}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-footnote outline-none transition-colors",
                          selected
                            ? "bg-accent-soft font-medium text-accent"
                            : "hover:bg-fill-hover",
                        )}
                      >
                        {/* 圆圈 + 白勾：选中态一眼看得出来（旧实现是一个转圈图标，
                            看着像"正在加载"而不是"已选中"） */}
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-full border",
                            selected ? "border-accent bg-accent text-white" : "border-separator",
                          )}
                        >
                          {selected ? <Check className="size-3" /> : null}
                        </span>
                        <FileText
                          className="size-4 shrink-0 text-label-tertiary"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {note.title?.trim() || "未命名笔记"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Button
            className="min-h-11 w-full"
            disabled={submit.isPending || !noteId}
            onClick={() => void handleSubmit()}
            data-testid="submit-task-confirm"
          >
            {submit.isPending ? "提交中…" : "提交"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
