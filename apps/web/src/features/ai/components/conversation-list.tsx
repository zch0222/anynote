"use client";

import { ListRowsSkeleton } from "@/components/loading/skeletons";
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
import {
  CONVERSATION_GROUP_PREVIEW_SIZE,
  groupConversations,
} from "@/features/ai/conversation-groups";
import type { Conversation } from "@/features/ai/schemas";
import { useChatKnowledgeBasesQuery } from "@/features/ai/use-chat-scope";
import {
  useConversationsQuery,
  useDeleteConversationMutation,
  useRenameConversationMutation,
} from "@/features/ai/use-conversations";
import { requestSidePanelLeave } from "@/features/side-panel/surface-events";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export type ConversationListProps = {
  /** 当前打开的会话 id；0 表示新对话。 */
  activeId: number;
  /** 侧栏分区键，切换、新建或删除当前会话前用它走侧栏正文的离开守卫。 */
  surface: string;
};

/**
 * 左侧会话列表，按知识库分组并支持新建、重命名、删除与组内分页。
 *
 * @param props 当前会话 id 与侧栏分区键
 * @author 称霸幼儿园
 */
export function ConversationList({ activeId, surface }: ConversationListProps) {
  const router = useRouter();
  const conversations = useConversationsQuery();
  const knowledgeBases = useChatKnowledgeBasesQuery();
  const deleteMutation = useDeleteConversationMutation();
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const [groupLimits, setGroupLimits] = useState<Readonly<Record<string, number>>>({});

  const rows = conversations.data;
  const bases = knowledgeBases.data;
  const groups = useMemo(() => groupConversations(rows ?? [], bases ?? []), [rows, bases]);

  /**
   * 站内跳到其他会话或新对话；目标与当前地址不同时先走侧栏离开守卫。
   *
   * @param href 目标地址
   */
  const navigate = (href: string) => {
    const current = `${window.location.pathname}${window.location.search}`;
    if (href !== current && !requestSidePanelLeave(surface)) return;
    router.push(href);
  };

  const handleDelete = async (summary: Conversation) => {
    if (!window.confirm(`删除会话「${summary.title ?? "未命名会话"}」？删除后不可恢复。`)) {
      return;
    }
    if (summary.id === activeId && !requestSidePanelLeave(surface)) return;
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

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-separator px-4">
        <p className="text-sm font-medium text-label">对话列表</p>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate("/ai/chat")}
          aria-label="新对话"
          title="新对话"
          data-testid="conversation-new"
        >
          <Plus className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-3" aria-label="会话列表">
        {conversations.isPending || knowledgeBases.isPending ? (
          <ListRowsSkeleton count={4} />
        ) : conversations.isError ? (
          <p className="px-2 py-4 text-sm text-danger">
            会话加载失败：{conversations.error.message}
          </p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-4 text-sm text-label-secondary">还没有历史会话</p>
        ) : (
          groups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            const limit = groupLimits[group.key] ?? CONVERSATION_GROUP_PREVIEW_SIZE;
            const visibleRows = group.conversations.slice(0, limit);
            const allVisible = visibleRows.length === group.conversations.length;
            return (
              <section key={group.key} className="space-y-0.5" data-group-key={group.key}>
                <button
                  type="button"
                  className="flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-label-secondary outline-none transition-colors hover:bg-fill-hover/70 hover:text-label focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={!collapsed}
                  onClick={() => toggleGroup(group.key)}
                  data-testid="conversation-group-toggle"
                >
                  {collapsed ? (
                    <Folder className="size-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <FolderOpen className="size-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate" title={group.label}>
                    {group.label}
                  </span>
                  {collapsed ? (
                    <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                </button>
                {!collapsed ? (
                  <div className="space-y-0.5">
                    {visibleRows.map((summary) => (
                      <ConversationRow
                        key={summary.id}
                        summary={summary}
                        active={summary.id === activeId}
                        deleteDisabled={deleteMutation.isPending}
                        onOpen={() => navigate(`/ai/chat/${summary.id}`)}
                        onRename={() => setRenaming(summary)}
                        onDelete={() => void handleDelete(summary)}
                      />
                    ))}
                    {group.conversations.length > CONVERSATION_GROUP_PREVIEW_SIZE ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start px-8 text-xs text-label-secondary"
                        aria-expanded={allVisible}
                        onClick={() =>
                          setGroupLimits((current) => ({
                            ...current,
                            [group.key]: allVisible
                              ? CONVERSATION_GROUP_PREVIEW_SIZE
                              : limit + CONVERSATION_GROUP_PREVIEW_SIZE,
                          }))
                        }
                      >
                        {allVisible ? "收起" : "显示更多"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })
        )}
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

/**
 * 单条会话及其打开、重命名和删除操作。
 *
 * @param props 会话摘要、选中状态与操作回调
 * @author 称霸幼儿园
 */
function ConversationRow({
  summary,
  active,
  deleteDisabled,
  onOpen,
  onRename,
  onDelete,
}: {
  summary: Conversation;
  active: boolean;
  deleteDisabled: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group flex min-h-10 items-center gap-1 rounded-lg px-1.5 transition-colors ${
        active ? "bg-fill-hover text-label" : "text-label-secondary hover:bg-fill-hover/70"
      }`}
      data-testid={`conversation-item-${summary.id}`}
      data-active={active ? "true" : "false"}
    >
      <button
        type="button"
        className="min-h-9 min-w-0 flex-1 cursor-pointer truncate rounded-md text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={summary.title ?? "未命名会话"}
        onClick={onOpen}
      >
        {summary.title ?? "未命名会话"}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 md:size-7 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100 md:data-[state=open]:opacity-100"
              disabled={deleteDisabled}
            />
          }
          aria-label={`会话「${summary.title ?? "未命名会话"}」操作`}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="size-4" aria-hidden="true" />
            重命名
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="size-4" aria-hidden="true" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
