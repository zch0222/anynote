"use client";

import { MobileActionSheet } from "@/components/layout/mobile/mobile-action-sheet";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMoocsQuery } from "@/features/mooc/use-moocs";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { ChevronDown, GraduationCap, Library } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * `/m/mooc`：课程单列卡片。
 *
 * 新建课程不进移动端：它要填封面、简介等一堆字段，在手机上是反体验，
 * 且课程通常由管理者在桌面端建。这里只做"看与学"。
 */
export function MobileMoocList() {
  const bases = useKnowledgeBasesQuery();
  const [baseId, setBaseId] = useState<number | null>(null);
  const moocs = useMoocsQuery(baseId ?? 0);

  const firstBase = bases.data?.[0];
  useEffect(() => {
    if (baseId === null && firstBase) {
      setBaseId(firstBase.id);
    }
  }, [firstBase, baseId]);

  const currentBase = bases.data?.find((base) => base.id === baseId);

  return (
    <MobileScreen
      title="课程"
      back="/m/me"
      toolbar={
        <MobileActionSheet
          title="选择知识库"
          description="课程挂在知识库下。"
          actions={(bases.data ?? []).map((base) => ({
            label: base.knowledgeBaseName ?? "未命名知识库",
            onSelect: () => setBaseId(base.id),
          }))}
          trigger={
            <Button variant="outline" className="min-h-10 w-full justify-between">
              <span className="truncate">{currentBase?.knowledgeBaseName ?? "选择知识库"}</span>
              <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
            </Button>
          }
        />
      }
    >
      <div className="space-y-3 p-4" data-testid="mobile-mooc-list">
        {!baseId ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <Library className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">
              {bases.isPending ? "正在加载知识库" : "还没有可用的知识库"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              课程挂在知识库下，先到笔记页创建一个。
            </p>
          </div>
        ) : moocs.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : moocs.isError ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            课程加载失败：{moocs.error.message}
          </p>
        ) : moocs.data.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <GraduationCap className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">这个知识库还没有课程</p>
            <p className="mt-1 text-sm text-muted-foreground">课程在桌面版创建。</p>
          </div>
        ) : (
          moocs.data.rows.map((mooc) => (
            <Link
              key={mooc.id}
              href={`/m/mooc/${mooc.id}`}
              className="block space-y-1 rounded-xl border bg-card p-4 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`mooc-card-${mooc.id}`}
            >
              <p className="truncate text-sm font-medium">{mooc.title ?? "未命名课程"}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {mooc.moocDescription?.trim() || "还没有课程简介"}
              </p>
            </Link>
          ))
        )}
      </div>
    </MobileScreen>
  );
}
