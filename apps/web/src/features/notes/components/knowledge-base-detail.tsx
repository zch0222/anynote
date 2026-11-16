"use client";

import { DocIndexBadge } from "@/features/ai/components/doc-index-badge";
import { isDocIndexPending } from "@/features/ai/doc-index-status";

import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Spinner } from "@/components/loading/spinner";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDocIndexStatus, useIndexDocMutation } from "@/features/ai/use-docs";
import { noteQueryKeys } from "@/features/notes/query-keys";
import { DOC_INDEXED, type DocListItem } from "@/features/notes/schemas";
import { useKnowledgeBaseDocsQuery } from "@/features/notes/use-docs";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Library, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KnowledgeBaseMembers } from "./knowledge-base-members";
import { KB_CONTENT_COLUMN, KnowledgeBasePageHeader } from "./knowledge-base-page-header";

// 「成员」Tab 从本文件拆出（12.2.6），但路由页仍从 `knowledge-base-detail` 取，
// 保持 import 路径稳定、避免同一轮里再改一次 page.tsx。
export { KnowledgeBaseMembers };

/** 知识库「笔记」Tab 的空态与新建入口由 `NoteList` 承担，这里只做路由壳。 */

/** 知识库「资料」Tab（`/notes/[baseId]/docs`）：该库下的 PDF 文档列表。 */
export function KnowledgeBaseDocs({ baseId }: { baseId: number }) {
  const docs = useKnowledgeBaseDocsQuery(baseId);
  const rows = docs.data?.rows ?? [];

  /*
   * 副标题走画板口径（D-08 实测：`9 份资料 · 7 份已索引`）：报真实统计。
   * 「已索引」是关键信息——只有已索引的文档才能被 AI 问答检索到，而这件事
   * 在列表里只有每行一个小徽标，页头给个总数才看得出"这个库现在能不能问"。
   */
  const indexed = rows.filter((doc) => doc.indexStatus === DOC_INDEXED).length;
  const subtitle = rows.length
    ? `${rows.length} 份资料 · ${indexed} 份已索引`
    : "这个知识库下的 PDF 文档。已索引的文档才能被 AI 问答检索到。";

  return (
    <div className={cn(KB_CONTENT_COLUMN, "space-y-4")} data-testid="kb-docs">
      <KnowledgeBasePageHeader
        title="资料"
        subtitle={subtitle}
        actions={
          /*
            上传与预览都交给「PDF 问答」（D-08）：那里已经有完整的上传 + 索引轮询链路，
            资料 Tab 再实现一份就会出现两条会漂移的路径。
          */
          <Button render={<Link href={`/ai/pdf?baseId=${baseId}`} />} data-testid="kb-docs-upload">
            <Upload className="size-4" aria-hidden="true" />
            上传 PDF
          </Button>
        }
      />

      {docs.isError ? (
        <QueryError
          object="资料"
          message={toUserMessage(docs.error)}
          onRetry={() => void docs.refetch()}
          retrying={docs.isFetching}
        />
      ) : (
        <DocList baseId={baseId} docs={rows} loading={docs.isPending} />
      )}
    </div>
  );
}

function DocList({
  baseId,
  docs,
  loading,
  limit,
}: {
  baseId: number;
  docs: readonly DocListItem[];
  loading: boolean;
  limit?: number | undefined;
}) {
  if (loading) {
    return <ListRowsSkeleton count={3} />;
  }

  const visible = limit ? docs.slice(0, limit) : docs;
  if (visible.length === 0) {
    // 概览里的资料块只是预览，标题与说明按 Q-02 合成一行（那里没有「重试」的位置）
    return limit ? (
      <EmptyState
        icon={Library}
        title="还没有资料。上传 PDF 后可以在「PDF 问答」里围绕它提问。"
        action={<UploadLink baseId={baseId} />}
      />
    ) : (
      <EmptyState
        icon={Library}
        title="还没有资料"
        hint="上传 PDF 后可以在「PDF 问答」里围绕它提问。"
        action={<UploadLink baseId={baseId} />}
      />
    );
  }

  /*
   * 两种形态分别是两种语义，所以分两条渲染路径而不是一套网格复用到底：
   * - **资料 Tab**（`limit` 为空）是一张**真表**：四列各有列头，用 `<table>` 表达；
   * - **概览预览块**（`limit` 有值）只是一个 3 行的列表，没有列头，
   *   给 `<div>` 挂 `role="row"` / `role="columnheader"` 是**无效 ARIA**
   *   （脱离 table 祖先的 row 角色不被读屏接受，Biome 也会直接报错）。
   */
  if (limit) {
    return (
      <ul className="overflow-hidden rounded-lg bg-surface shadow-card">
        {visible.map((doc) => (
          <li key={doc.id} className="group relative border-b border-separator last:border-b-0">
            {/*
              整行可点（D-08 图例 8）。`<a>` 里嵌 `<button>` 是非法嵌套，所以
              索引按钮浮在 `Link` 外面（`group` 在 `li` 上，悬停仍然联动）。
            */}
            <Link
              href={`/ai/pdf?baseId=${baseId}&docId=${doc.id}`}
              data-testid={`kb-doc-row-${doc.id}`}
              className={cn(
                "flex min-h-14 items-center gap-3 py-2 pr-28 pl-4 outline-none transition-colors",
                "hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              )}
            >
              <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-footnote text-label">
                  {doc.docName?.trim() || "未命名文档"}
                </span>
                {/* 预览块没有列头，所以「上传者 · 时间」折在标题下方 */}
                <span className="block truncate text-xs text-label-tertiary">
                  {doc.creatorNickname?.trim() || doc.creatorUsername?.trim() || "未知作者"}
                  {doc.createTime ? ` · ${formatRelativeTime(doc.createTime)}` : ""}
                </span>
              </span>
            </Link>
            <div className="absolute top-1/2 right-4 flex -translate-y-1/2 items-center">
              <DocIndexCell baseId={baseId} doc={doc} />
            </div>
          </li>
        ))}
        {docs.length > limit ? (
          <li className="px-4 py-2 text-xs text-label-tertiary">
            还有 {docs.length - limit} 份资料，进入「资料」查看全部
          </li>
        ) : null}
        <span className="sr-only">知识库 {baseId}</span>
      </ul>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg bg-surface shadow-card">
      <Table>
        {/*
          表头行（D-08）：文件名 / 上传者 / 上传时间 / AI 索引。
          列宽按画板量出的比例给定值，文件名列吃掉剩余宽度。
        */}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-10 pl-4 text-xs font-medium text-label-tertiary">
              文件名
            </TableHead>
            <TableHead className="h-10 w-[120px] text-xs font-medium text-label-tertiary">
              上传者
            </TableHead>
            <TableHead className="h-10 w-[120px] text-xs font-medium text-label-tertiary">
              上传时间
            </TableHead>
            <TableHead className="h-10 w-[100px] text-xs font-medium text-label-tertiary">
              AI 索引
            </TableHead>
            {/* 行尾 chevron，没有表头文字 */}
            <TableHead className="h-10 w-12" />
          </TableRow>
        </TableHeader>
        <TableBody data-testid="kb-doc-rows">
          {visible.map((doc) => (
            <TableRow
              key={doc.id}
              className="group relative border-b border-separator last:border-b-0 hover:bg-fill-hover"
            >
              <TableCell className="py-0 pl-4 whitespace-normal">
                <Link
                  href={`/ai/pdf?baseId=${baseId}&docId=${doc.id}`}
                  data-testid={`kb-doc-row-${doc.id}`}
                  className="flex min-h-14 items-center gap-3 outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                >
                  <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-footnote text-label">
                    {doc.docName?.trim() || "未命名文档"}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="py-0 text-footnote text-label-secondary">
                {doc.creatorNickname?.trim() || doc.creatorUsername?.trim() || "未知作者"}
              </TableCell>
              <TableCell className="py-0 text-footnote text-label-tertiary">
                {doc.createTime ? formatRelativeTime(doc.createTime) : "—"}
              </TableCell>
              {/*
                「AI 索引」格：放徽标本身，不再绝对定位——有列头之后，
                绝对定位的徽标会与列头对不齐。未索引态下悬停出现的是
                `<button>`，而它在 `<a>` **之外**（本格不在链接里），嵌套合法。
              */}
              <TableCell className="relative py-0">
                <DocIndexCell baseId={baseId} doc={doc} />
              </TableCell>
              <TableCell className="py-0 text-label-tertiary">
                <ChevronRight className="size-4" aria-hidden="true" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <span className="sr-only">知识库 {baseId}</span>
    </div>
  );
}

/** 空态里的「去上传」：带上当前库，落到 PDF 问答时不用再选一次。 */
function UploadLink({ baseId }: { baseId: number }) {
  return (
    <Button variant="outline" size="sm" render={<Link href={`/ai/pdf?baseId=${baseId}`} />}>
      去上传
    </Button>
  );
}

/** 资料索引状态及重建入口。 */
function DocIndexCell({ baseId, doc }: { baseId: number; doc: DocListItem }) {
  const queryClient = useQueryClient();
  const [indexing, setIndexing] = useState(false);
  const indexDoc = useIndexDocMutation();
  const poll = useDocIndexStatus(doc.id, {
    enabled: indexing || isDocIndexPending(doc.indexStatus),
  });
  const status = indexDoc.isPending
    ? 1
    : (poll.data?.indexStatus ?? (indexing ? 1 : doc.indexStatus));

  useEffect(() => {
    if (!poll.data || isDocIndexPending(poll.data.indexStatus)) return;
    setIndexing(false);
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.docList(baseId) });
  }, [poll.data, queryClient, baseId]);

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <DocIndexBadge status={status} />
      {status === 2 || status === 3 ? (
        <Button
          variant="outline"
          size="xs"
          disabled={indexDoc.isPending}
          onClick={() =>
            indexDoc.mutate(doc.id, {
              onSuccess: () => setIndexing(true),
              onError: (error) =>
                toast.error(error instanceof Error ? error.message : "建立索引失败，请稍后重试"),
            })
          }
          data-testid={`doc-index-${doc.id}`}
        >
          建立索引
        </Button>
      ) : null}
    </span>
  );
}

/**
 * 权限档位文案。
 *
 * 实现与「成员」Tab 一起搬到了 `knowledge-base-members.tsx`（12.2.6），
 * 这里只做再导出，保持既有的 import 路径可用。
 */
export { permissionLabel } from "./knowledge-base-members";

/** 知识库不存在 / 无权限时的兜底。 */
export function KnowledgeBaseMissing({ baseId }: { baseId: number }) {
  return (
    <div className="mx-auto w-full max-w-md space-y-3 rounded-lg bg-surface p-8 text-center shadow-card">
      <Library className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
      <p className="text-headline text-label">找不到这个知识库</p>
      <p className="text-footnote text-label-secondary">
        它可能已被删除，或者你还没有访问权限（id: {baseId}）。
      </p>
      <Button variant="outline" size="sm" render={<Link href="/notes" />}>
        <ChevronLeft aria-hidden="true" />
        回到知识库
      </Button>
    </div>
  );
}
