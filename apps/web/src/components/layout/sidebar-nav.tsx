"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/features/auth/use-me";
import { coverAvatarClassName } from "@/features/notes/lib/cover-gradient";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toolGroups } from "./navigation";

/** 侧栏只列一屏放得下的量，再多交给画廊页；侧栏是导航不是文件树。 */
const SIDEBAR_BASE_LIMIT = 12;

/**
 * 知识库在侧栏的当前态。
 *
 * 只在 `/notes/*` 下才算"选中"，且要同时比对路径里的 id——
 * 否则所有知识库行都会因为前缀相同而一起高亮。
 */
export function isBaseActive(pathname: string, baseId: number): boolean {
  return pathname === `/notes/${baseId}` || pathname.startsWith(`/notes/${baseId}/`);
}

/**
 * 侧栏的知识库条目：渐变缩略图 + 名称 +（可选）计数。
 *
 * 计数只在传入时才渲染——后端 `/bases` 列表页不带笔记数，
 * 硬编一个数字比不显示更糟。
 */
export function SidebarBaseItem({
  baseId,
  name,
  active,
  trailing,
}: {
  baseId: number;
  name: string;
  active: boolean;
  trailing?: string | undefined;
}) {
  return (
    <Link
      href={`/notes/${baseId}`}
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : "false"}
      data-testid={`sidebar-base-${baseId}`}
      className={cn(
        "flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1.5 text-footnote outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-accent-soft font-medium text-accent" : "text-label hover:bg-separator/40",
      )}
    >
      <span className={coverAvatarClassName(baseId, "size-4 rounded-xs")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {trailing ? (
        <span className="tabular shrink-0 text-xs text-label-tertiary">{trailing}</span>
      ) : null}
    </Link>
  );
}

function SidebarGroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pb-1 pt-4 text-xs font-medium text-label-tertiary">{children}</p>;
}

function BaseListSkeleton() {
  return (
    <div className="mt-1 space-y-1 px-2" aria-busy="true">
      {["a", "b", "c"].map((key) => (
        <div key={key} className="flex items-center gap-2.5 py-1.5">
          <Skeleton className="size-4 rounded-xs" />
          <Skeleton className="h-3.5 flex-1" />
        </div>
      ))}
    </div>
  );
}

/**
 * 侧栏的知识库区：一级导航里唯一的**动态**列表。
 *
 * 设计稿把「知识库」做成一级入口而不是四个平铺的静态入口，
 * 所以这里直接消费 `/bases` 的 query 缓存——画廊页与侧栏共用同一份数据，
 * 在画廊页新建知识库后侧栏会同步刷新，不需要额外失效逻辑。
 */
export function SidebarKnowledgeBases() {
  const pathname = usePathname();
  const bases = useKnowledgeBasesQuery();

  return (
    <section aria-label="知识库">
      <div className="flex items-center justify-between gap-2 pl-2 pr-1 pt-4">
        <span className="text-xs font-medium text-label-tertiary">知识库</span>
        <Link
          href="/notes"
          className="rounded-xs px-1 text-xs text-label-tertiary outline-none transition-colors hover:text-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          全部
        </Link>
      </div>

      {bases.isPending ? (
        <BaseListSkeleton />
      ) : bases.isError ? (
        <p className="px-2 py-1.5 text-xs text-danger">知识库加载失败</p>
      ) : bases.data.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-label-tertiary">还没有知识库</p>
      ) : (
        <nav aria-label="知识库列表" className="mt-1 space-y-0.5">
          {bases.data.slice(0, SIDEBAR_BASE_LIMIT).map((base) => (
            <SidebarBaseItem
              key={base.id}
              baseId={base.id}
              name={base.knowledgeBaseName?.trim() || "未命名知识库"}
              active={isBaseActive(pathname, base.id)}
            />
          ))}
        </nav>
      )}

      <Link
        href="/notes?new=1"
        data-testid="sidebar-new-base"
        className="mt-1 flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1.5 text-footnote font-medium text-accent outline-none transition-colors hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className="size-4 shrink-0" aria-hidden="true" />
        新建知识库
      </Link>
    </section>
  );
}

/** AI 助手与协作：不挂在任何知识库下的跨库能力。 */
export function SidebarToolGroups() {
  const pathname = usePathname();

  return (
    <>
      {toolGroups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <nav className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  data-active={active ? "true" : "false"}
                  className={cn(
                    "flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1.5 text-footnote outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-label hover:bg-separator/40",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                  <span className="truncate">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </section>
      ))}
    </>
  );
}

/** 侧栏页脚：用户卡。设置入口收在这里，不再占一格一级导航。 */
export function SidebarUserCard() {
  const { data } = useMe();
  const name = data?.nickname || data?.username || "我的账户";

  return (
    <Link
      href="/settings/profile"
      data-testid="sidebar-user"
      className="flex min-h-12 items-center gap-2.5 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-separator/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Avatar className="size-8">
        <AvatarImage src={data?.avatar || undefined} alt="" />
        <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote font-medium text-label">{name}</span>
        <span className="block truncate text-xs text-label-tertiary">
          {data?.username ? `${data.username}@anynote` : "个人设置"}
        </span>
      </span>
    </Link>
  );
}
