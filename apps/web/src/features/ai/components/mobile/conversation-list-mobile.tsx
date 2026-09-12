"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Conversation } from "@/features/ai/schemas";
import {
  useConversationsInfinite,
  useDeleteConversationMutation,
  useRenameConversationMutation,
} from "@/features/ai/use-conversations";
import { MessageSquare, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

/**
 * `/m/ai/chat`：会话列表独立成页。
 *
 * 桌面把它压在左栏里，手机上左栏是 `hidden md:block`——等于完全不可达（P0-2）。
 * 重命名 / 删除改走底部动作表：桌面那个入口是 hover 才出现的，触摸端点不到。
 */
export function MobileConversationList() {
  const conversations = useConversationsInfinite();
  const deleteMutation = useDeleteConversationMutation();
  const [acting, setActing] = useState<Conversation | null>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);

  const rows = conversations.data?.pages.flatMap((page) => page.rows) ?? [];

  const handleDelete = async (summary: Conversation) => {
    try {
      await deleteMutation.mutateAsync(summary.id);
      toast.success("会话已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败，请稍后重试");
    }
  };

  return (
    <MobileScreen
      title="AI 对话"
      actions={
        <Link
          href="/m/ai/chat/new"
          aria-label="新对话"
          data-testid="mobile-conversation-new"
          className="flex size-10 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-5" aria-hidden="true" />
        </Link>
      }
    >
      <div className="space-y-4 p-4" data-testid="mobile-conversations">
        {conversations.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : conversations.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            会话加载失败：{conversations.error.message}
          </p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <MessageSquare className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">还没有历史会话</p>
            <p className="mt-1 text-sm text-muted-foreground">从右上角开一段新对话。</p>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {rows.map((summary) => (
              <li
                key={summary.id}
                className="flex items-center"
                data-testid={`conversation-item-${summary.id}`}
              >
                <Link
                  href={`/m/ai/chat/${summary.id}`}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-sm outline-none focus-visible:bg-accent"
                >
                  <MessageSquare
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{summary.title ?? "未命名会话"}</span>
                </Link>
                <button
                  type="button"
                  aria-label={`会话「${summary.title ?? "未命名会话"}」操作`}
                  onClick={() => setActing(summary)}
                  className="flex size-11 shrink-0 items-center justify-center text-muted-foreground outline-none focus-visible:bg-accent"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {conversations.hasNextPage ? (
          <Button
            variant="outline"
            className="min-h-11 w-full"
            disabled={conversations.isFetchingNextPage}
            onClick={() => {
              void conversations.fetchNextPage();
            }}
          >
            {conversations.isFetchingNextPage ? "加载中…" : "加载更多"}
          </Button>
        ) : null}
      </div>

      {acting ? (
        <MobileActionSheet
          open
          onOpenChange={(next) => {
            if (!next) setActing(null);
          }}
          title={acting.title ?? "未命名会话"}
          actions={[
            {
              label: "重命名",
              icon: Pencil,
              onSelect: () => {
                setRenaming(acting);
                setActing(null);
              },
            },
            {
              label: "删除会话",
              icon: Trash2,
              destructive: true,
              confirm: "再点一次确认删除",
              disabled: deleteMutation.isPending,
              onSelect: () => {
                void handleDelete(acting);
                setActing(null);
              },
            },
          ]}
        />
      ) : null}

      {renaming ? (
        <RenameDialog
          summary={renaming}
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
        />
      ) : null}
    </MobileScreen>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名会话</DialogTitle>
          <DialogDescription>标题只用于列表展示，不影响对话内容。</DialogDescription>
        </DialogHeader>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={50}
          aria-label="会话标题"
          className="min-h-11"
          data-testid="conversation-rename-input"
        />
        <DialogFooter>
          <Button
            className="min-h-11 w-full"
            onClick={() => void submit()}
            disabled={renameMutation.isPending}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
