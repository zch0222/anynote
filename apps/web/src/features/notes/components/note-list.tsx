"use client";

import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEFAULT_PAGE_SIZE, type NoteListItem } from "@/features/notes/schemas";
import { useDeleteNoteMutation } from "@/features/notes/use-delete-note";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useMoveNoteMutation } from "@/features/notes/use-move-note";
import { useNotesQuery } from "@/features/notes/use-notes";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, MoreHorizontal, NotebookPen, Plus, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { KB_CONTENT_COLUMN, KnowledgeBasePageHeader } from "./knowledge-base-page-header";

/*
 * 「新建笔记」对话框按需加载，理由同 `knowledge-base-detail.tsx`：
 * 它顶层引着 react-hook-form，静态引入会把整棵表单依赖树压进笔记列表的首屏。
 */
const CreateNoteDialog = dynamic(
  () => import("./create-note-dialog").then((mod) => mod.CreateNoteDialog),
  { ssr: false },
);

/** 页头与空态的主按钮样式：两处必须是同一个按钮，只换措辞不换形。 */
const CREATE_TRIGGER_CLASS =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-footnote font-medium text-white outline-none transition-colors hover:bg-accent/85 focus-visible:ring-2 focus-visible:ring-ring";

/**
 * 知识库「笔记」Tab（`/notes/[baseId]`）。
 *
 * 设计稿里笔记是**列表**而不是卡片网格：一篇笔记的辨识信息主要是标题 + 更新时间，
 * 用卡片会把一屏能看的条数砍掉一半，而笔记恰恰是最需要快速扫过去的一类。
 */
export function NoteList({ baseId }: { baseId: number }) {
  const [page, setPage] = useState(1);
  const bases = useKnowledgeBasesQuery();
  const notes = useNotesQuery({ knowledgeBaseId: baseId, page, pageSize: DEFAULT_PAGE_SIZE });
  const totalPages = notes.data?.pages ?? 1;

  // 移动目标只列**别的**库：把自己列进去点了没反应，等于给了个假选项。
  const otherBases = (bases.data ?? []).filter((item) => item.id !== baseId);

  /*
   * 副标题走画板口径（D-01 实测：`128 篇笔记 · 最近更新于 2 小时前`）：
   * 报**真实统计**而不是一句固定文案。固定文案在空库与满库时一模一样，
   * 用户没法从页头判断这个库到底有没有东西。
   *
   * "最近更新于"取列表首行的时间：列表端点已按最近操作时间倒序，
   * 首行就是最近动过的那篇，无需再让后端补一个聚合字段。
   */
  const total = notes.data?.total ?? 0;
  const latest = notes.data?.rows[0];
  const latestTime = latest ? (latest.latestOperationTime ?? latest.updateTime) : null;
  const subtitle = total
    ? `${total} 篇笔记${latestTime ? ` · 最近更新于 ${formatRelativeTime(latestTime)}` : ""}`
    : "捕捉灵感，让每一个想法都有归处。";

  return (
    <div className={cn(KB_CONTENT_COLUMN, "space-y-4")} data-testid="note-list">
      <KnowledgeBasePageHeader
        title="笔记"
        subtitle={subtitle}
        actions={
          <CreateNoteDialog
            knowledgeBaseId={baseId}
            triggerTestId="note-create"
            trigger={
              <>
                <Plus className="size-4" aria-hidden="true" />
                新建笔记
              </>
            }
            triggerClassName={CREATE_TRIGGER_CLASS}
          />
        }
      />

      {notes.isPending ? (
        <ListRowsSkeleton />
      ) : notes.isError ? (
        <QueryError
          object="笔记"
          message={toUserMessage(notes.error)}
          onRetry={() => void notes.refetch()}
          retrying={notes.isFetching}
        />
      ) : notes.data.rows.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="这个知识库还没有笔记"
          hint="新建一篇，开始记录。"
          action={
            <CreateNoteDialog
              knowledgeBaseId={baseId}
              triggerTestId="note-create-empty"
              trigger={
                <>
                  <Plus className="size-4" aria-hidden="true" />
                  新建笔记
                </>
              }
              triggerClassName={CREATE_TRIGGER_CLASS}
            />
          }
        />
      ) : (
        <>
          <div
            className="overflow-hidden rounded-lg bg-surface shadow-card"
            data-testid="note-list-card"
          >
            {/*
              列头（D-01 图例 18）：40 高 · 12/16 Medium · label/tertiary · 底部 1px separator。
              画板把它画成列表卡里的第一行而不是一个独立的表头块——所以它必须
              **在卡片内部**，否则卡片顶部会多出一条灰底缝隙。
              用 role="row" 的语义表头而不是纯视觉文本：读屏用户需要知道
              "最近"那一列是什么。
            */}
            <div
              role="row"
              className="flex h-10 items-center border-b border-separator px-4 text-xs font-medium text-label-tertiary"
            >
              <span className="min-w-0 flex-1" role="columnheader">
                标题
              </span>
              <span className="shrink-0 pr-12" role="columnheader">
                最近更新
              </span>
            </div>
            <ul className="divide-y divide-separator" data-testid="note-list-items">
              {notes.data.rows.map((note) => (
                <li key={note.id} className="group relative">
                  <NoteRow baseId={baseId} note={note} otherBases={otherBases} />
                </li>
              ))}
            </ul>
          </div>
          {totalPages > 1 ? (
            <nav aria-label="分页" className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                上一页
              </Button>
              <span className="tabular text-footnote text-label-secondary">
                第 {page} / {totalPages} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                下一页
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function NoteRow({
  baseId,
  note,
  otherBases,
}: {
  baseId: number;
  note: NoteListItem;
  otherBases: readonly { id: number; knowledgeBaseName?: string | null | undefined }[];
}) {
  // 列表页优先展示"最后一次动过"的时间；没有操作记录才退回更新时间
  const touched = note.latestOperationTime ?? note.updateTime;
  const title = note.title?.trim() || "未命名笔记";
  return (
    <>
      <Link
        href={`/notes/${baseId}/${note.id}`}
        data-testid={`note-row-${note.id}`}
        className={cn(
          "flex min-h-14 items-center gap-3 py-2.5 pr-12 pl-4 outline-none transition-colors",
          "hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        )}
      >
        <NotebookPen className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-body text-label">{title}</span>
        <span className="tabular shrink-0 text-xs text-label-tertiary">
          {formatRelativeTime(touched)}
        </span>
      </Link>
      <NoteRowMenu noteId={note.id} title={title} otherBases={otherBases} />
    </>
  );
}

/**
 * 行操作「⋯」（D-01 图例 22）。
 *
 * 三个刻意的决定：
 * 1. **按钮绝对定位在行右侧**而不是塞进 `Link` 里——`<a>` 内嵌 `<button>` 是非法
 *    嵌套，浏览器会把按钮提出来，点击落到链接上变成"打开笔记"。
 * 2. **只在悬停 / 行内聚焦时显示**（`opacity-0 group-hover:…`），但仍然留在 Tab
 *    序列里：键盘用户 Tab 到它时 `group-focus-within` 让它显形，不是"看得见才可点"。
 * 3. **菜单打开期间强制可见**：弹层渲染在 portal 里，焦点离开行之后
 *    `group-focus-within` 会失效，否则菜单还开着、触发按钮先消失了。
 */
function NoteRowMenu({
  noteId,
  title,
  otherBases,
}: {
  noteId: number;
  title: string;
  otherBases: readonly { id: number; knowledgeBaseName?: string | null | undefined }[];
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const move = useMoveNoteMutation();
  const remove = useDeleteNoteMutation();

  async function handleMove(target: { id: number; knowledgeBaseName?: string | null | undefined }) {
    try {
      await move.mutateAsync({ noteId, knowledgeBaseId: target.id });
      toast.success(`已移动到 ${target.knowledgeBaseName?.trim() || "未命名知识库"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移动失败，请稍后重试");
    }
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync(noteId);
      toast.success("笔记已删除");
      setConfirming(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "absolute top-1/2 right-2 -translate-y-1/2 text-label-secondary transition-opacity",
                "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                open && "opacity-100",
              )}
            />
          }
          aria-label={`「${title}」的操作`}
          data-testid={`note-actions-${noteId}`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>移动到知识库</DropdownMenuLabel>
            {otherBases.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-label-tertiary">没有其他知识库</p>
            ) : (
              otherBases.map((base) => (
                <DropdownMenuItem
                  key={base.id}
                  disabled={move.isPending}
                  onClick={() => void handleMove(base)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {base.knowledgeBaseName?.trim() || "未命名知识库"}
                  </span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              删除笔记
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="删除笔记？"
        description={`「${title}」删除后无法恢复。`}
        confirmLabel="删除"
        pendingLabel="删除中…"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
