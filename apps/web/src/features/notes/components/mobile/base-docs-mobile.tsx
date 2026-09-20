"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MobileBaseHeader } from "@/features/notes/components/mobile/base-section-tabs";
import { DOC_INDEXED } from "@/features/notes/schemas";
import { useKnowledgeBaseDocsQuery } from "@/features/notes/use-docs";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { formatRelativeTime } from "@/lib/format-time";
import { ChevronRight, FileText, FolderOpen, Info } from "lucide-react";
import Link from "next/link";

/**
 * `/m/notes/[baseId]/docs`：知识库内的「资料」Tab（M-05）。
 *
 * 旧实现是独立页（顶栏标题「资料」，没有库头与 Tab），从那三个 Tab 切过来
 * 像跳到了另一页。现在用 12.7.2 的公共头部收进知识库，行也可点了——
 * 点进已有的移动端 PDF 详情 `/m/ai/pdf/[docId]`。
 *
 * 上传仍只走「PDF 问答」一条链路（它带索引状态轮询），这里只放一个文字链接。
 */
export function MobileBaseDocs({ baseId }: { baseId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const docs = useKnowledgeBaseDocsQuery(baseId);
  const rows = docs.data?.rows ?? [];

  return (
    <MobileScreen
      title={base.data?.knowledgeBaseName?.trim() || "资料"}
      back="/m/notes"
      tone="paper"
    >
      <div className="space-y-4 pb-4" data-testid="mobile-base-docs">
        <MobileBaseHeader baseId={baseId} current="docs" />

        <div className="space-y-3 px-4">
          {docs.isPending ? (
            <ListRowsSkeleton count={3} />
          ) : docs.isError ? (
            <QueryError
              object="资料"
              error={docs.error}
              onRetry={() => void docs.refetch()}
              retrying={docs.isFetching}
            />
          ) : rows.length === 0 ? (
            // 空态的动作按 12.0.3 的表：一个「去上传」，指向 PDF 问答那一条上传链路
            <EmptyState
              icon={FolderOpen}
              title="还没有资料"
              hint="到「PDF 问答」上传 PDF，之后就能围绕它提问。"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/m/ai/pdf" data-testid="mobile-doc-upload-link" />}
                >
                  去上传
                </Button>
              }
            />
          ) : (
            <>
              <ul className="overflow-hidden rounded-lg bg-surface" data-testid="mobile-doc-items">
                {rows.map((doc) => (
                  <li key={doc.id} className="border-b border-separator last:border-b-0">
                    <Link
                      href={`/m/ai/pdf/${doc.id}`}
                      data-testid={`mobile-doc-${doc.id}`}
                      className="flex min-h-[68px] items-center gap-3 px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      {/*
                        V10（2026-09-19 核对）：行首补 36 的文件图标块（画板 M-05 图例 4），
                        否则资料行与纯文字行无异，和笔记列表也分不出来。
                      */}
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent"
                        aria-hidden="true"
                      >
                        <FileText className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-headline text-label">
                          {doc.docName?.trim() || "未命名文档"}
                        </span>
                        <span className="block truncate text-footnote text-label-tertiary">
                          {doc.creatorNickname?.trim() || doc.creatorUsername?.trim() || "未知作者"}
                          {doc.createTime ? ` · ${formatRelativeTime(doc.createTime)}` : ""}
                        </span>
                      </span>
                      <Badge variant={doc.indexStatus === DOC_INDEXED ? "success" : "secondary"}>
                        {doc.indexStatus === DOC_INDEXED ? "已索引" : "未索引"}
                      </Badge>
                      <ChevronRight
                        className="size-4 shrink-0 text-label-tertiary"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
              {/* V10：画板 M-05 图例 2 的索引能力说明，解释徽标的意义 */}
              <p className="flex items-center gap-1.5 px-1 text-footnote text-label-tertiary">
                <Info className="size-3.5 shrink-0" aria-hidden="true" />
                只有已索引的资料才能被 AI 问答检索到。
              </p>
              <Link
                href="/m/ai/pdf"
                data-testid="mobile-doc-upload-link"
                className="flex min-h-11 items-center justify-center text-footnote font-medium text-accent outline-none focus-visible:underline"
              >
                去「PDF 问答」上传 ›
              </Link>
            </>
          )}
        </div>
      </div>
    </MobileScreen>
  );
}
