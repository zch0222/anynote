"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DOC_INDEXED } from "@/features/notes/schemas";
import { useKnowledgeBaseDocsQuery } from "@/features/notes/use-docs";
import { formatRelativeTime } from "@/lib/format-time";
import { FileText, Library } from "lucide-react";

/**
 * `/m/notes/[baseId]/docs`：知识库内的「资料」Tab（移动端）。
 *
 * 只读列表——上传 PDF 走「PDF 问答」那条完整链路（它带索引状态轮询），
 * 这里再放一个上传入口会变成第二条上传实现。
 */
export function MobileBaseDocs({ baseId }: { baseId: number }) {
  const docs = useKnowledgeBaseDocsQuery(baseId);

  return (
    <MobileScreen title="资料" back={`/m/notes/${baseId}`}>
      <div className="space-y-2 p-4" data-testid="mobile-base-docs">
        {docs.isPending ? (
          <div className="space-y-2" aria-busy="true">
            {["a", "b", "c"].map((key) => (
              <Skeleton key={key} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : docs.isError ? (
          <p role="alert" className="rounded-lg bg-danger/5 p-4 text-footnote text-danger">
            资料加载失败：{docs.error.message}
          </p>
        ) : docs.data.rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-separator p-6 text-center">
            <Library className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
            <p className="mt-3 text-headline text-label">还没有资料</p>
            <p className="mt-1 text-footnote text-label-secondary">
              到「PDF 问答」上传 PDF，之后就能围绕它提问。
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.data.rows.map((doc) => (
              <li
                key={doc.id}
                className="flex min-h-16 items-center gap-3 rounded-lg bg-surface p-3 shadow-card"
              >
                <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-footnote text-label">
                    {doc.docName?.trim() || "未命名文档"}
                  </span>
                  <span className="block truncate text-xs text-label-tertiary">
                    {doc.creatorNickname?.trim() || doc.creatorUsername?.trim() || "未知作者"}
                    {doc.createTime ? ` · ${formatRelativeTime(doc.createTime)}` : ""}
                  </span>
                </span>
                <Badge variant={doc.indexStatus === DOC_INDEXED ? "success" : "secondary"}>
                  {doc.indexStatus === DOC_INDEXED ? "已索引" : "未索引"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MobileScreen>
  );
}
