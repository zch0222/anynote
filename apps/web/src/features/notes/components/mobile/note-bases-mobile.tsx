"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateBaseDialog } from "@/features/notes/components/create-base-dialog";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { ChevronRight, Library } from "lucide-react";
import Link from "next/link";

export type MobileNoteBasesProps = {
  /** 列表项跳转的前缀：`/m/notes` 是可写的笔记，`/m/wikis` 是只读浏览。 */
  basePath?: "/m/notes" | "/m/wikis";
  title?: string;
  description?: string;
  /** 只读浏览（wikis）不提供新建入口。 */
  showCreate?: boolean;
};

/**
 * `/m/notes` 与 `/m/wikis` 的第一级：知识库单列列表（桌面是三列卡片网格）。
 *
 * 两条路由共用同一个组件而不是各写一份——数据与版式完全一样，
 * 差别只有跳转前缀与是否提供新建入口。
 * 新建走桌面就有的 `CreateBaseDialog`——它没有任何桌面专属跳转，直接复用。
 */
export function MobileNoteBases({
  basePath = "/m/notes",
  title = "笔记",
  description = "捕捉灵感，让每一个想法都有归处。",
  showCreate = true,
}: MobileNoteBasesProps = {}) {
  const bases = useKnowledgeBasesQuery();

  return (
    <MobileScreen title={title}>
      <div className="space-y-4 p-4" data-testid="mobile-note-bases">
        <p className="text-sm text-muted-foreground">{description}</p>

        {bases.isPending ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : bases.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            知识库加载失败：{bases.error.message}
          </p>
        ) : bases.data.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <Library className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">还没有知识库</p>
            <p className="mt-1 text-sm text-muted-foreground">先建一个知识库，笔记会归到它下面。</p>
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {bases.data.map((base) => (
              <li key={base.id}>
                <Link
                  href={`${basePath}/${base.id}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-2 text-sm outline-none focus-visible:bg-accent"
                >
                  <Library className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {base.knowledgeBaseName ?? "未命名知识库"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {base.detail?.trim() || "还没有填写简介"}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {showCreate ? <CreateBaseDialog /> : null}
      </div>
    </MobileScreen>
  );
}
