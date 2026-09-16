"use client";

import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Spinner } from "@/components/loading/spinner";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDocIndexStatus, useIndexDocMutation } from "@/features/ai/use-docs";
import { noteQueryKeys } from "@/features/notes/query-keys";
import { DOC_INDEXED, type DocListItem } from "@/features/notes/schemas";
import { useKnowledgeBaseDocsQuery } from "@/features/notes/use-docs";
import { toUserMessage } from "@/lib/api/errors";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, FileText, Library, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KnowledgeBaseMembers } from "./knowledge-base-members";

// 「成员」Tab 从本文件拆出（12.2.6），但路由页仍从 `knowledge-base-detail` 取，
// 保持 import 路径稳定、避免同一轮里再改一次 page.tsx。
export { KnowledgeBaseMembers };

/** 知识库「笔记」Tab 的空态与新建入口由 `NoteList` 承担，这里只做路由壳。 */

/** 知识库「资料」Tab（`/notes/[baseId]/docs`）：该库下的 PDF 文档列表。 */
export function KnowledgeBaseDocs({ baseId }: { baseId: number }) {
  const docs = useKnowledgeBaseDocsQuery(baseId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4" data-testid="kb-docs">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-title text-label">资料</h1>
          <p className="text-footnote text-label-secondary">
            这个知识库下的 PDF 文档。已索引的文档才能被 AI 问答检索到。
          </p>
        </div>
        {/*
          上传与预览都交给「PDF 问答」（D-08）：那里已经有完整的上传 + 索引轮询链路，
          资料 Tab 再实现一份就会出现两条会漂移的路径。
        */}
        <Button render={<Link href={`/ai/pdf?baseId=${baseId}`} />} data-testid="kb-docs-upload">
          <Upload className="size-4" aria-hidden="true" />
          上传 PDF
        </Button>
      </header>

      {docs.isError ? (
        <QueryError
          object="资料"
          message={toUserMessage(docs.error)}
          onRetry={() => void docs.refetch()}
          retrying={docs.isFetching}
        />
      ) : (
        <DocList baseId={baseId} docs={docs.data?.rows ?? []} loading={docs.isPending} />
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

  return (
    <ul className="divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-card">
      {visible.map((doc) => (
        <li key={doc.id} className="group relative">
          {/*
            整行可点（D-08 图例 8）：`Link` 铺满行高，索引按钮在它**外面**——
            `<a>` 里嵌 `<button>` 是非法嵌套，浏览器会把按钮提出来，
            结果就是"点建立索引反而打开了 PDF"。
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
      {limit && docs.length > limit ? (
        <li className="px-4 py-2 text-xs text-label-tertiary">
          还有 {docs.length - limit} 份资料，进入「资料」查看全部
        </li>
      ) : null}
      <span className="sr-only">知识库 {baseId}</span>
    </ul>
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

/**
 * 索引状态格（D-08 图例 15）。
 *
 * 三种形态互斥：已索引 → 徽标；索引中 → 徽标 + 转圈；未索引 → 徽标，
 * 悬停或行内聚焦时**换成**「建立索引」按钮。切换用 `group-hover` / `group-focus-within`
 * 而不是条件渲染：条件渲染要靠 JS 追踪悬停，键盘用户拿不到同一个入口。
 *
 * 索引是 RocketMQ 异步链路（`POST /docs/{id}/index` 只是投递），所以点击后
 * 不能立刻重取列表——那一刻 `indexStatus` 还是 0。这里切到 `useDocIndexStatus`
 * 轮询，轮询到 1 再失效列表，把权威状态交回服务端。
 */
function DocIndexCell({ baseId, doc }: { baseId: number; doc: DocListItem }) {
  const queryClient = useQueryClient();
  const [indexing, setIndexing] = useState(false);
  const indexDoc = useIndexDocMutation();
  const poll = useDocIndexStatus(doc.id, { enabled: indexing });

  const indexed = doc.indexStatus === DOC_INDEXED || poll.data?.indexStatus === DOC_INDEXED;

  useEffect(() => {
    if (poll.data?.indexStatus !== DOC_INDEXED) return;
    setIndexing(false);
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.docList(baseId) });
  }, [poll.data, queryClient, baseId]);

  if (indexed) {
    return <Badge variant="success">已索引</Badge>;
  }

  if (indexing) {
    return (
      <Badge variant="secondary" data-testid={`doc-indexing-${doc.id}`}>
        {/*
          不传 label：紧邻的「索引中…」已经是可播报的状态，
          再给 SVG 挂 role="status" 会让读屏把同一件事念两遍。
        */}
        <Spinner size="badge" className="mr-1" />
        索引中…
      </Badge>
    );
  }

  return (
    <span
      className={cn(
        "relative flex items-center justify-end",
        // 不可见时不能截获点击：否则"点了个空"也会触发建立索引
        "pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto",
      )}
    >
      <Badge
        variant="secondary"
        className="transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
      >
        未索引
      </Badge>
      <Button
        variant="outline"
        size="xs"
        className="absolute right-0 h-6 bg-surface text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        disabled={indexDoc.isPending}
        onClick={() => {
          // 先切到轮询态再发请求：接口很慢时按钮不能一直"没反应"
          setIndexing(true);
          indexDoc.mutate(doc.id, {
            onError: (error) => {
              setIndexing(false);
              toast.error(error instanceof Error ? error.message : "建立索引失败，请稍后重试");
            },
          });
        }}
        data-testid={`doc-index-${doc.id}`}
      >
        建立索引
      </Button>
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
