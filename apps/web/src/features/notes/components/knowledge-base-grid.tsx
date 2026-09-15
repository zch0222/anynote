"use client";

import { CardGridSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { Library } from "lucide-react";
import Link from "next/link";
import { CreateBaseDialog } from "./create-base-dialog";

/**
 * 知识库卡片网格。
 *
 * **当前没有路由引用它**（`/notes` 已改用 `KnowledgeBaseGallery`）。保留在这里是因为
 * 它仍是 12.0.3 清单里的一处错误态；等 12.1 路由迁移收口后一并判定去留，
 * 这里只做错误态与空态的替换，不动版式。
 */
export function KnowledgeBaseGrid() {
  const bases = useKnowledgeBasesQuery();

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">笔记</h1>
          <p className="text-sm text-label-secondary">捕捉灵感，让每一个想法都有归处。</p>
        </div>
        <CreateBaseDialog />
      </div>

      {bases.isPending ? (
        <CardGridSkeleton count={3} cardClassName="h-36" />
      ) : bases.isError ? (
        <QueryError
          object="知识库"
          error={bases.error}
          onRetry={() => void bases.refetch()}
          retrying={bases.isFetching}
        />
      ) : bases.data.length === 0 ? (
        <EmptyState icon={Library} title="还没有知识库" hint="先建一个知识库，笔记会归到它下面。" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bases.data.map((base) => (
            <li key={base.id}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <Link
                  href={`/notes/${base.id}`}
                  className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Library
                        className="size-4 shrink-0 text-label-secondary"
                        aria-hidden="true"
                      />
                      <span className="truncate">{base.knowledgeBaseName ?? "未命名知识库"}</span>
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {base.detail?.trim() || "还没有填写简介"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-label-secondary">
                    {base.updateTime ? `更新于 ${base.updateTime.slice(0, 10)}` : "暂无更新记录"}
                  </CardContent>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
