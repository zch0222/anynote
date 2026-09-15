"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { Segmented } from "@/components/ui/segmented";
import { useMe } from "@/features/auth/use-me";
import { type BaseScopeSource, selectBases } from "@/features/notes/lib/base-scope";
import { coverAvatarClassName } from "@/features/notes/lib/cover-gradient";
import { type BaseScope, type KnowledgeBase, baseScopeOptions } from "@/features/notes/schemas";
import {
  useKnowledgeBasesQuery,
  useManagedKnowledgeBasesQuery,
  useOrganizationKnowledgeBasesQuery,
} from "@/features/notes/use-knowledge-bases";
import { formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { ChevronRight, Library, Plus, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * 新建知识库对话框按需加载。
 *
 * 它顶层引着 react-hook-form + `@hookform/resolvers/zod` + 一整套 Dialog 原子，
 * 静态引入会把这条依赖树整棵压进 `/m/notes` 的首屏——而用户十有八九只是来看
 * 列表的，不建库。`/m/*` 的预算是 250KB，这一条就顶掉了余量。
 */
const CreateBaseDialog = dynamic(
  () =>
    import("@/features/notes/components/create-base-dialog").then((mod) => mod.CreateBaseDialog),
  { ssr: false },
);

export type MobileNoteBasesProps = {
  title?: string;
  /** 只读场景（无新建权限）不提供新建入口。 */
  showCreate?: boolean;
};

/**
 * `/m/notes`：知识库单列列表。
 *
 * 版式对齐设计稿：大标题 + 搜索框 + 分段筛选 + 「最近访问」单列卡片。
 * 数据与分段逻辑与桌面画廊**共用**（同一个 `selectBases`），
 * 只换版式——两端各写一份筛选规则迟早会漂。
 *
 * 12.1.3 删掉了 `/m/wikis` 与它的 `basePath` 参数：只读浏览那条链路整条下线，
 * 列表项只剩 `/m/notes/:baseId` 一种落点。
 */
export function MobileNoteBases({
  title = "知识库",
  showCreate = true,
}: MobileNoteBasesProps = {}) {
  const [scope, setScope] = useState<BaseScope>("all");
  const [keyword, setKeyword] = useState("");
  const me = useMe();
  const userId = me.data?.id ?? 0;

  const mine = useKnowledgeBasesQuery();
  const managed = useManagedKnowledgeBasesQuery(scope === "mine" ? userId : 0);
  const organization = useOrganizationKnowledgeBasesQuery();

  const mineRows = mine.data;
  const managedRows = managed.data;
  const organizationRows = organization.data;

  const bases = useMemo(() => {
    const source: BaseScopeSource = {
      mine: mineRows ?? [],
      managed: managedRows ?? [],
      organization: organizationRows ?? [],
    };
    const scoped = selectBases(scope, source);
    const trimmed = keyword.trim().toLowerCase();
    if (!trimmed) return scoped;
    return scoped.filter((base) => (base.knowledgeBaseName ?? "").toLowerCase().includes(trimmed));
  }, [scope, keyword, mineRows, managedRows, organizationRows]);

  const queries = [mine, scope === "mine" ? managed : null, organization].filter(
    (query) => query !== null,
  );
  const loading = queries.some((query) => query.isPending);
  const failed = queries.find((query) => query.isError);

  /** 与桌面画廊同口径的终态标记，E2E 据此等"加载结束"。 */
  const state = failed ? "error" : loading ? "loading" : bases.length === 0 ? "empty" : "ready";

  return (
    <MobileScreen
      title={title}
      actions={
        showCreate ? (
          <CreateBaseDialog
            trigger={<Plus className="size-5" aria-hidden="true" />}
            triggerLabel="新建知识库"
            triggerTestId="mobile-base-create"
            triggerClassName="grid size-10 place-items-center rounded-full bg-accent text-white outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        ) : undefined
      }
    >
      <div className="space-y-4 p-4" data-testid="mobile-note-bases" data-state={state}>
        <label className="flex min-h-10 items-center gap-2 rounded-md bg-separator/40 px-3">
          <Search className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
          <span className="sr-only">搜索知识库</span>
          <input
            type="search"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
            }}
            placeholder="搜索知识库、笔记、慕课"
            aria-label="搜索知识库"
            className="min-w-0 flex-1 bg-transparent text-footnote text-label outline-none placeholder:text-label-tertiary"
          />
        </label>

        <Segmented
          label="知识库范围"
          options={baseScopeOptions}
          value={scope}
          onChange={setScope}
          className="w-full justify-between"
        />

        <p className="text-xs text-label-tertiary">最近访问</p>

        {failed ? (
          <p role="alert" className="rounded-lg bg-danger/5 p-4 text-footnote text-danger">
            知识库加载失败：{failed.error.message}
          </p>
        ) : loading ? (
          <ListRowsSkeleton count={3} />
        ) : bases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-separator p-6 text-center">
            <Library className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
            <p className="mt-3 text-headline text-label">
              {keyword.trim() ? "没有匹配的知识库" : "还没有知识库"}
            </p>
            <p className="mt-1 text-footnote text-label-secondary">
              {keyword.trim() ? "换个关键词试试。" : "先建一个知识库，笔记会归到它下面。"}
            </p>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="mobile-base-list">
            {bases.map((base) => (
              <li key={base.id}>
                <BaseCard base={base} href={`/m/notes/${base.id}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </MobileScreen>
  );
}

/**
 * 单列知识库卡：渐变方块缩略图 + 名称 + 一行元信息。
 *
 * 元信息优先显示简介（设计稿里组织库显示"18 位成员 · 96 篇笔记"，
 * 但那两个计数后端列表页都不返回），没有简介才退回更新时间——
 * 宁可不显示，也不编一个假数字。
 */
function BaseCard({ base, href }: { base: KnowledgeBase; href: string }) {
  const name = base.knowledgeBaseName?.trim() || "未命名知识库";
  const detail = base.detail?.trim();
  const relative = formatRelativeTime(base.updateTime);

  return (
    <Link
      href={href}
      data-testid={`mobile-base-${base.id}`}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg bg-surface p-3 shadow-card outline-none",
        "transition-colors focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className={coverAvatarClassName(base.id, "size-11 rounded-lg")} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-headline font-semibold text-label">{name}</span>
        <span className="block truncate text-footnote text-label-secondary">
          {detail || (relative ? `${relative}更新` : "还没有填写简介")}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />
    </Link>
  );
}
