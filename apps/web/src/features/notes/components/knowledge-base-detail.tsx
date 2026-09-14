"use client";

import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { coverClassName } from "@/features/notes/lib/cover-gradient";
import {
  DOC_INDEXED,
  type DocListItem,
  type KnowledgeBaseMember,
  memberDisplayName,
} from "@/features/notes/schemas";
import { useKnowledgeBaseDocsQuery } from "@/features/notes/use-docs";
import {
  useKnowledgeBaseMembersQuery,
  useKnowledgeBaseQuery,
} from "@/features/notes/use-knowledge-bases";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { ChevronLeft, FileText, Library, Users } from "lucide-react";
import Link from "next/link";

/** 概览页只取前几条做预览，"更多"回到对应 Tab。 */
const OVERVIEW_PREVIEW = 4;

/**
 * 知识库「概览」Tab（`/notes/[baseId]/overview`）。
 *
 * 设计稿里概览承担"这个库是什么、里面有什么"的一眼判断，
 * 所以只放元信息 + 两个预览块，不做统计图表——后端没有聚合端点，
 * 前端拼出来的图只会与真实列表越走越偏。
 */
export function KnowledgeBaseOverview({ baseId }: { baseId: number }) {
  const base = useKnowledgeBaseQuery(baseId);
  const docs = useKnowledgeBaseDocsQuery(baseId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6" data-testid="kb-overview">
      <section className="overflow-hidden rounded-lg bg-surface shadow-card">
        <div aria-hidden="true" className={cn(coverClassName(baseId), "h-28 w-full")} />
        <div className="space-y-3 p-5">
          {base.isPending ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <h1 className="text-title text-label">
              {base.data?.knowledgeBaseName?.trim() || "未命名知识库"}
            </h1>
          )}
          <p className="text-footnote text-label-secondary">
            {base.data?.detail?.trim() || "这个知识库还没有填写简介。"}
          </p>
          {base.data?.updateTime ? (
            <p className="text-xs text-label-tertiary">
              更新于 {formatRelativeTime(base.data.updateTime)}
            </p>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-headline text-label">
            <FileText className="size-4 text-label-secondary" aria-hidden="true" />
            资料
          </h2>
          <Link
            href={`/notes/${baseId}/docs`}
            className="text-footnote text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            全部资料
          </Link>
        </header>
        <DocList
          baseId={baseId}
          docs={docs.data?.rows ?? []}
          loading={docs.isPending}
          limit={OVERVIEW_PREVIEW}
        />
      </section>
    </div>
  );
}

/** 知识库「笔记」Tab 的空态与新建入口由 `NoteList` 承担，这里只做路由壳。 */

/** 知识库「资料」Tab（`/notes/[baseId]/docs`）：该库下的 PDF 文档列表。 */
export function KnowledgeBaseDocs({ baseId }: { baseId: number }) {
  const docs = useKnowledgeBaseDocsQuery(baseId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4" data-testid="kb-docs">
      <header className="space-y-1">
        <h1 className="text-title text-label">资料</h1>
        <p className="text-footnote text-label-secondary">
          这个知识库下的 PDF 文档。已索引的文档才能被 AI 问答检索到。
        </p>
      </header>

      {docs.isError ? (
        <p role="alert" className="rounded-lg bg-danger/5 p-6 text-footnote text-danger">
          资料加载失败：{docs.error.message}
        </p>
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
    return (
      <div className="rounded-lg border border-dashed border-separator p-8 text-center">
        <Library className="mx-auto size-7 text-label-tertiary" aria-hidden="true" />
        <p className="mt-2 text-footnote text-label-secondary">
          还没有资料。上传 PDF 后可以在「PDF 问答」里围绕它提问。
        </p>
        <Button variant="outline" size="sm" className="mt-3" render={<Link href="/ai/pdf" />}>
          去上传
        </Button>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-card">
      {visible.map((doc) => (
        <li key={doc.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
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
      {limit && docs.length > limit ? (
        <li className="px-4 py-2 text-xs text-label-tertiary">
          还有 {docs.length - limit} 份资料，进入「资料」查看全部
        </li>
      ) : null}
      <span className="sr-only">知识库 {baseId}</span>
    </ul>
  );
}

/** 知识库「成员」Tab（`/notes/[baseId]/members`）。 */
export function KnowledgeBaseMembers({ baseId }: { baseId: number }) {
  const members = useKnowledgeBaseMembersQuery(baseId);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4" data-testid="kb-members">
      <header className="space-y-1">
        <h1 className="text-title text-label">成员</h1>
        <p className="text-footnote text-label-secondary">
          能访问这个知识库的人，以及他们各自的权限档位。
        </p>
      </header>

      {members.isError ? (
        <p role="alert" className="rounded-lg bg-danger/5 p-6 text-footnote text-danger">
          成员加载失败：{members.error.message}
        </p>
      ) : members.isPending ? (
        <ListRowsSkeleton count={3} />
      ) : members.data.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-separator p-8 text-center">
          <Users className="mx-auto size-7 text-label-tertiary" aria-hidden="true" />
          <p className="mt-2 text-footnote text-label-secondary">这个知识库还没有其他成员。</p>
        </div>
      ) : (
        <ul className="divide-y divide-separator overflow-hidden rounded-lg bg-surface shadow-card">
          {members.data.rows.map((member) => (
            <MemberRow key={member.userId} member={member} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 权限档位文案。
 *
 * 与后端 `KnowledgeBasePermissions` 的取值一一对应（1 管理 / 2 编辑 / 3 阅读 /
 * 4 无权限），数值越小权限越大——这个方向反直觉，所以集中在这里翻译一次。
 */
export function permissionLabel(permissions: number | null | undefined): string {
  switch (permissions) {
    case 1:
      return "管理员";
    case 2:
      return "可编辑";
    case 3:
      return "可阅读";
    default:
      return "无权限";
  }
}

function MemberRow({ member }: { member: KnowledgeBaseMember }) {
  const name = memberDisplayName(member);
  const permissions = member.permissions ?? 0;
  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-footnote font-medium text-accent"
      >
        {name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-footnote text-label">{name}</span>
        {member.username ? (
          <span className="block truncate text-xs text-label-tertiary">{member.username}</span>
        ) : null}
      </span>
      <Badge variant={permissions <= 2 ? "organization" : "secondary"}>
        {permissionLabel(member.permissions)}
      </Badge>
    </li>
  );
}

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
