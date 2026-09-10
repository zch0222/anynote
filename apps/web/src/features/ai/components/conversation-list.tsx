"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Conversation } from "@/features/ai/schemas";
import {
  useConversationsInfinite,
  useDeleteConversationMutation,
  useRenameConversationMutation,
} from "@/features/ai/use-conversations";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export type ConversationListProps = {
  /** 当前打开的会话 id；0 表示新对话。 */
  activeId: number;
};

/** 左侧会话列表：新建 / 重命名 / 删除，分页「加载更多」。 */
export function ConversationList({ activeId }: ConversationListProps) {
  const router = useRouter();
  const conversations = useConversationsInfinite();
  const deleteMutation = useDeleteConversationMutation();
  const [renaming, setRenaming] = useState<Conversation | null>(null);

  const rows = conversations.data?.pages.flatMap((page) => page.rows) ?? [];

  const handleDelete = async (summary: Conversation) => {
    if (!window.confirm(`删除会话「${summary.title ?? "未命名会话"}」？删除后不可恢复。`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(summary.id);
      toast.success("会话已删除");
      if (summary.id === activeId) {
        router.replace("/ai/chat");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => router.push("/ai/chat")}
          data-testid="conversation-new"
        >
          <Plus className="size-4" aria-hidden="true" />
          新对话
        </Button>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3" aria-label="会话列表">
        {conversations.isPending ? (
          [0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-10 rounded-lg" />)
        ) : conversations.isError ? (
          <p className="px-2 py-4 text-sm text-destructive">
            会话加载失败：{conversations.error.message}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">还没有历史会话</p>
        ) : (
          rows.map((summary) => (
            <div
              key={summary.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors ${
                summary.id === activeId ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
              }`}
              data-testid={`conversation-item-${summary.id}`}
              data-active={summary.id === activeId ? "true" : "false"}
            >
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer truncate text-left outline-none"
                title={summary.title ?? "未命名会话"}
                onClick={() => {
                  router.push(`/ai/chat/${summary.id}`);
                }}
              >
                {summary.title ?? "未命名会话"}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                      disabled={deleteMutation.isPending}
                    />
                  }
                  aria-label={`会话「${summary.title ?? "未命名会话"}」操作`}
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setRenaming(summary);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                    重命名
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      void handleDelete(summary);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
        {conversations.hasNextPage ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={conversations.isFetchingNextPage}
            onClick={() => {
              void conversations.fetchNextPage();
            }}
          >
            加载更多
          </Button>
        ) : null}
      </nav>
      {renaming ? (
        <RenameDialog
          summary={renaming}
          onOpenChange={(open) => {
            if (!open) {
              setRenaming(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function RenameDialog({
  summary,
  onOpenChange,
}: {
  summary: Conversation;
  onOpenChange: (open: boolean) => void;
}) {
  const renameMutation = useRenameConversationMutation();
  const [title, setTitle] = useState(summary.title ?? "");

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("会话标题不能为空");
      return;
    }
    try {
      await renameMutation.mutateAsync({ conversationId: summary.id, title: trimmed });
      toast.success("会话已重命名");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重命名失败，请稍后重试");
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>重命名会话</DialogTitle>
          <DialogDescription>标题只用于列表展示，不影响对话内容。</DialogDescription>
        </DialogHeader>
        <Input
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          maxLength={50}
          aria-label="会话标题"
          data-testid="conversation-rename-input"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={renameMutation.isPending}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
