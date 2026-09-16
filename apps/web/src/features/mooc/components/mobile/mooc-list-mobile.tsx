"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
import { useMoocsQuery } from "@/features/mooc/use-moocs";
import { MobileBaseHeader } from "@/features/notes/components/mobile/base-section-tabs";
import { coverClassName } from "@/features/notes/lib/cover-gradient";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { ChevronRight, GraduationCap } from "lucide-react";
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
                    className="flex min-h-[92px] items-center gap-3 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    {/*
                      H-9：行左侧是**封面色块**（M-03 图例原文）。
                      没有它时整列是纯文字，一行课程与一行笔记长得一模一样，
                      而用户在课程列表里首先认的是"那门蓝色封面的课"。
                      用与桌面课程卡同一套 `coverClassName`，两处颜色一致。
                    */}
                    <span
                      aria-hidden="true"
                      className={cn(coverClassName(mooc.id), "size-12 shrink-0 rounded-md")}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
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
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-label-tertiary"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
              {/*
                H-9：列表**最末**一行「新建课程请使用桌面版」。
                原来只在空态给「课程在桌面版创建。」，一旦库里已经有课，
                这句话就消失了——而"想再建一门课"恰恰发生在看着列表的时候。
                做成列表的最后一行而不是一个按钮：移动端建不了课程（要传封面、填简介），
                给按钮等于给一个点了没用的入口。
              */}
              <li
                className="px-3 py-3 text-center text-xs text-label-tertiary"
                data-testid="mobile-mooc-desktop-hint"
              >
                新建课程请使用桌面版
              </li>
            </ul>
          )}
        </div>
      </div>
    </MobileScreen>
  );
}
