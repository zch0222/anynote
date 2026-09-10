"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { Library } from "lucide-react";
import Link from "next/link";
import { CreateBaseDialog } from "./create-base-dialog";

/** `/notes` 首屏：把用户能访问的知识库铺成卡片，点进去看这个库下的笔记。 */
export function KnowledgeBaseGrid() {
  const bases = useKnowledgeBasesQuery();

  return (
    <section className="mx-auto w-full max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">笔记</h1>
          <p className="text-sm text-muted-foreground">捕捉灵感，让每一个想法都有归处。</p>
        </div>
        <CreateBaseDialog />
      </div>

      {bases.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : bases.isError ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          知识库加载失败：{bases.error.message}
        </p>
      ) : bases.data.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Library className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">还没有知识库</p>
          <p className="mt-1 text-sm text-muted-foreground">先建一个知识库，笔记会归到它下面。</p>
        </div>
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
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate">{base.knowledgeBaseName ?? "未命名知识库"}</span>
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {base.detail?.trim() || "还没有填写简介"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
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
