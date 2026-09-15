"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
import { useMoocsQuery } from "@/features/mooc/use-moocs";
import { MobileBaseHeader } from "@/features/notes/components/mobile/base-section-tabs";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { GraduationCap } from "lucide-react";
import Link from "next/link";

/**
 * `/m/notes/[baseId]/mooc`：知识库内的「慕课」Tab（M-03）。
 *
 * 这个路由原先渲染的是**跨库**课程列表（顶栏「课程」+ 知识库选择器，返回键回
 * `/m/me`），从「笔记」切过来会以为跳出了当前知识库。现在收回知识库里：
 * `baseId` 由路由给，选择器删掉，库头与 Tab 用 12.7.2 的公共头部。
 *
 * 版式从描边卡片堆换成行列表（92 高 + 1px 分隔线），与笔记列表同一种语言。
 */
export function MobileMoocList({ baseId }: { baseId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const moocs = useMoocsQuery(baseId);
  const rows = moocs.data?.rows ?? [];

  return (
    <MobileScreen title={base.data?.knowledgeBaseName?.trim() || "慕课"} back="/m/notes">
      <div className="space-y-4 pb-4" data-testid="mobile-mooc-list">
        <MobileBaseHeader
          baseId={baseId}
          current="mooc"
          meta={moocs.data?.total ? `${moocs.data.total} 门课程` : undefined}
        />

        <div className="px-4">
          {moocs.isPending ? (
            <ListRowsSkeleton count={3} />
          ) : moocs.isError ? (
            <QueryError
              object="课程"
              message={toUserMessage(moocs.error)}
              onRetry={() => void moocs.refetch()}
              retrying={moocs.isFetching}
            />
          ) : rows.length === 0 ? (
            // 图例 M-03：空态只给文案，**不给按钮**——移动端不建课程（要填封面、简介）
            <EmptyState
              icon={GraduationCap}
              title="这个知识库还没有课程"
              hint="课程在桌面版创建。"
            />
          ) : (
            <ul className="overflow-hidden rounded-lg bg-surface" data-testid="mobile-mooc-items">
              {rows.map((mooc) => (
                <li key={mooc.id} className="border-b border-separator last:border-b-0">
                  <Link
                    href={`/m/notes/${baseId}/mooc/${mooc.id}`}
                    data-testid={`mobile-mooc-${mooc.id}`}
                    className="flex min-h-[92px] flex-col justify-center gap-1 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="truncate text-headline font-semibold text-label">
                      {mooc.title?.trim() || "未命名课程"}
                    </span>
                    {mooc.moocDescription?.trim() ? (
                      <span className="line-clamp-2 text-footnote text-label-secondary">
                        {mooc.moocDescription}
                      </span>
                    ) : null}
                    {mooc.updateTime ? (
                      <span className="tabular text-xs text-label-tertiary">
                        更新于 {formatRelativeTime(mooc.updateTime)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </MobileScreen>
  );
}
