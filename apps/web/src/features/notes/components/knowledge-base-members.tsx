"use client";

import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useMe } from "@/features/auth/use-me";
import { type KnowledgeBaseMember, memberDisplayName } from "@/features/notes/schemas";
import {
  useKnowledgeBaseMembersQuery,
  useKnowledgeBaseQuery,
  useRemoveMemberMutation,
} from "@/features/notes/use-knowledge-bases";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { MoreHorizontal, UserMinus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KB_CONTENT_COLUMN, KnowledgeBasePageHeader } from "./knowledge-base-page-header";

/** 搜索防抖时长（D-09 图例 7）：300ms 是"打字停下来"与"按键即请求"之间的常用折中。 */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * 知识库「成员」Tab（`/notes/[baseId]/members`，D-09）。
 *
 * 谁能进这个库、能做什么。三件事都只在后端已有端点的基础上做：
 * 三档权限说明（纯前端文案）、按用户名搜索（`/bases/users` 已有 `username` 参数）、
 * 管理员移除成员（`DELETE /bases/users`）。
 *
 * 添加成员不画入口：只有管理后台端点 `/manage/bases/addUser` 能加人，
 * 普通管理员能否调用尚未确认。
 */
export function KnowledgeBaseMembers({ baseId }: { baseId: number }) {
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  const [removing, setRemoving] = useState<KnowledgeBaseMember | null>(null);

  const me = useMe();
  const base = useKnowledgeBaseQuery(baseId);
  const members = useKnowledgeBaseMembersQuery(baseId, { username: debounced });
  const removeMember = useRemoveMemberMutation();

  // 300ms 防抖：每敲一个字母就发一次请求会打出一串用不上的响应，
  // 而且后到的旧响应可能盖住新结果（列表没有请求序号，无法自行纠正）。
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(keyword.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [keyword]);

  // 只有本库管理员才看得到行操作（permissions 1 = 管理），且后端禁止移除自己
  const isAdmin = base.data?.permissions === 1;
  const meId = me.data?.id;
  const rows = members.data?.rows ?? [];
  const searching = debounced.length > 0;

  async function handleRemove() {
    if (!removing) return;
    try {
      await removeMember.mutateAsync({ userId: removing.userId, knowledgeBaseId: baseId });
      toast.success("成员已移除");
      setRemoving(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除失败，请稍后重试");
    }
  }

  /*
   * 副标题走画板口径（D-09 实测：`12 位成员 · 我的权限：管理员`）：报真实统计
   * 与**我自己的权限**。原来那句「能访问这个知识库的人，以及他们各自的权限档位。」
   * 在任何一个库上读起来都一样，等于没提供信息；而"我的权限"恰恰是这一页最该
   * 在页头回答的问题（用户点进成员 Tab，多半就是想确认自己能做什么）。
   */
  const memberCount = members.data?.total ?? rows.length;
  const myPermission = base.data?.permissions;
  const subtitle = memberCount
    ? `${memberCount} 位成员 · 我的权限：${permissionLabel(myPermission)}`
    : "能访问这个知识库的人，以及他们各自的权限档位。";

  return (
    <div className={cn(KB_CONTENT_COLUMN, "space-y-4")} data-testid="kb-members">
      <KnowledgeBasePageHeader title="成员" subtitle={subtitle} />

      <PermissionGuide />

      <div className="flex items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Input
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
            }}
            placeholder="按用户名搜索"
            aria-label="按用户名搜索"
            className="h-9 bg-grouped"
            data-testid="member-search"
          />
        </div>
        {/* D-09：搜索行右侧的「共 N 位」计数——搜索后才知道筛掉了多少人 */}
        <span
          className="tabular shrink-0 text-footnote text-label-tertiary"
          data-testid="member-count"
        >
          共 {memberCount} 位
        </span>
      </div>

      {members.isError ? (
        <QueryError
          object="成员"
          message={toUserMessage(members.error)}
          onRetry={() => void members.refetch()}
          retrying={members.isFetching}
        />
      ) : members.isPending ? (
        <ListRowsSkeleton count={3} />
      ) : rows.length === 0 ? (
        searching ? (
          // 搜索无结果不是"这个库没人"，所以给的是清除搜索而不是新建入口
          <EmptyState
            title={`没有找到用户名包含「${debounced}」的成员`}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setKeyword("");
                }}
              >
                清除搜索
              </Button>
            }
          />
        ) : (
          <EmptyState icon={Users} title="这个知识库还没有其他成员。" />
        )
      ) : (
        <ul className="divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-card">
          {rows.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              removable={isAdmin && member.userId !== meId}
              onRemove={() => {
                setRemoving(member);
              }}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="移除成员？"
        description={`移除后 ${memberDisplayName(removing ?? { userId: 0 })} 将无法再访问这个知识库。`}
        confirmLabel="移除"
        pendingLabel="移除中…"
        tone="danger"
        pending={removeMember.isPending}
        onConfirm={() => void handleRemove()}
      />
    </div>
  );
}

/** 权限档位说明卡（D-09 图例 6）：三列 56 高、不可点，只解释数值大小关系。 */
const PERMISSION_GUIDE = [
  { permissions: 1, label: "管理员", hint: "可以管理成员、任务与全部内容。" },
  { permissions: 2, label: "可编辑", hint: "可以创建和修改笔记、课程与资料。" },
  { permissions: 3, label: "可阅读", hint: "只能查看内容，不能修改。" },
] as const;

function PermissionGuide() {
  return (
    <ul className="grid gap-3 sm:grid-cols-3" data-testid="permission-guide">
      {PERMISSION_GUIDE.map((item) => (
        <li
          key={item.permissions}
          className="flex min-h-14 flex-col justify-center gap-1 rounded-lg bg-surface px-4 py-2 shadow-card"
        >
          <Badge variant={item.permissions <= 2 ? "organization" : "secondary"} className="w-fit">
            {item.label}
          </Badge>
          <span className="text-xs text-label-secondary">{item.hint}</span>
        </li>
      ))}
    </ul>
  );
}

function MemberRow({
  member,
  removable,
  onRemove,
}: {
  member: KnowledgeBaseMember;
  removable: boolean;
  onRemove: () => void;
}) {
  const name = memberDisplayName(member);
  const permissions = member.permissions ?? 0;
  return (
    <li className="group relative flex min-h-14 items-center gap-3 py-2 pr-12 pl-4">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-footnote font-medium text-accent"
      >
        {name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote text-label">{name}</span>
        {member.username ? (
          <span className="block truncate text-xs text-label-tertiary">{member.username}</span>
        ) : null}
      </span>
      <Badge variant={permissions <= 2 ? "organization" : "secondary"}>
        {permissionLabel(member.permissions)}
      </Badge>
      {removable ? <MemberRowMenu member={member} onRemove={onRemove} /> : null}
    </li>
  );
}

/**
 * 行操作「⋯」（D-09 图例 15 / 16）。
 *
 * 显示规则与笔记 Tab 一致：悬停或行内聚焦才显形，但仍然留在 Tab 序列里。
 * 菜单第一行是成员名 + 权限档位——只写「移除成员」的话，菜单挪开之后
 * 用户无法确认自己点的是哪一行。
 */
function MemberRowMenu({
  member,
  onRemove,
}: {
  member: KnowledgeBaseMember;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = memberDisplayName(member);
  return (
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
        aria-label={`${name} 的操作`}
        data-testid={`member-actions-${member.userId}`}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Base UI 的 GroupLabel 必须挂在 Group 下，否则抛 MenuGroupContext is missing */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {name} · {permissionLabel(member.permissions)}
          </DropdownMenuLabel>
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
            <UserMinus className="size-4" aria-hidden="true" />
            移除成员
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 权限档位文案。
 *
 * 与后端 `KnowledgeBasePermissions` 的取值一一对应（1 管理 / 2 编辑 / 3 阅读 /
 * 4 无权限），数值越小权限越大——这个方向反直觉，所以集中在这里翻译一次。
 */
export function permissionLabel(permissions: number | null | undefined): string {
  switch (permissions) {
    case 1:
      return "管理员";
    case 2:
      return "可编辑";
    case 3:
      return "可阅读";
    default:
      return "无权限";
  }
}
