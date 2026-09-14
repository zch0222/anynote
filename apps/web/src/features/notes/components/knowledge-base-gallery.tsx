"use client";

import { CardGridSkeleton } from "@/components/loading/skeletons";
import { Segmented } from "@/components/ui/segmented";
import { useMe } from "@/features/auth/use-me";
import { coverClassName } from "@/features/notes/lib/cover-gradient";
import {
  type BaseScope,
  type KnowledgeBase,
  baseScopeOptions,
  baseScopes,
} from "@/features/notes/schemas";
import {
  useKnowledgeBasesQuery,
  useManagedKnowledgeBasesQuery,
  useOrganizationKnowledgeBasesQuery,
} from "@/features/notes/use-knowledge-bases";
import { formatCardMeta } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { Library, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CreateBaseDialog } from "./create-base-dialog";

/** 画廊只铺一屏放得下的量；再多交给搜索。 */
const GALLERY_LIMIT = 12;

export type BaseScopeSource = {
  /** `/bases`：我参与的普通知识库。 */
  mine: readonly KnowledgeBase[];
  /** `/bases/managerList`：我管理的普通知识库。 */
  managed: readonly KnowledgeBase[];
  /** `/bases/organizations`：我所属组织的组织知识库。 */
  organization: readonly KnowledgeBase[];
};

/**
 * 分段筛选。
 *
 * 三个分段对应**三个不同口径的后端查询**，不是同一份数据的本地切片：
 * 普通知识库与组织知识库在 `n_knowledge_base.type` 上就是两棵树，
 * 所以「全部」= 普通 ∪ 组织，而不是"不过滤"。
 *
 * 去重按 id：组织库也可能出现在「我管理的」里（我是该库管理员又是组织成员），
 * 同一张卡不能出现两次。
 */
export function selectBases(scope: BaseScope, source: BaseScopeSource): KnowledgeBase[] {
  const pools =
    scope === "all"
      ? [source.mine, source.organization]
      : scope === "mine"
        ? [source.managed]
        : [source.organization];
  const seen = new Set<number>();
  const result: KnowledgeBase[] = [];
  for (const pool of pools) {
    for (const base of pool) {
      if (seen.has(base.id)) continue;
      seen.add(base.id);
      result.push(base);
    }
  }
  return result;
}

/**
 * `/notes`：知识库画廊。
 *
 * 这是重设计的**首页级**页面——原「工作台 / 笔记 / 文档 / 知识库」四个平铺入口
 * 收敛成"知识库是根"之后，用户落地的第一屏就是它。
 *
 * `openCreate` 由路由从 `?new=1` 读出来传进来（侧栏「新建知识库」与卡片入口
 * 都指这个地址）：这样服务端就能决定对话框的初始开合，不需要客户端再解析
 * 一次 query，也就少一层 `useSearchParams` + Suspense 的依赖。
 */
export function KnowledgeBaseGallery({ openCreate = false }: { openCreate?: boolean } = {}) {
  const [scope, setScope] = useState<BaseScope>("all");
  const me = useMe();
  const userId = me.data?.id ?? 0;

  // 只有当前分段需要的查询会被订阅：`enabled` 让另外两个不发请求
  const mine = useKnowledgeBasesQuery();
  const managed = useManagedKnowledgeBasesQuery(scope === "mine" ? userId : 0);
  const organization = useOrganizationKnowledgeBasesQuery();

  const source: BaseScopeSource = {
    mine: mine.data ?? [],
    managed: managed.data ?? [],
    organization: organization.data ?? [],
  };
  const bases = selectBases(scope, source);
  const visible = bases.slice(0, GALLERY_LIMIT);

  const queries = [mine, scope === "mine" ? managed : null, organization].filter(
    (query) => query !== null,
  );
  const loading = queries.some((query) => query.isPending);
  const failed = queries.find((query) => query.isError);

  /** 画廊的四种终态。E2E 用一个稳定的 testid 等"加载结束"，不必猜是卡片还是空态。 */
  const state = failed ? "error" : loading ? "loading" : visible.length === 0 ? "empty" : "ready";

  return (
    <section
      className="mx-auto w-full max-w-6xl space-y-4"
      data-testid="kb-gallery"
      data-state={state}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        {/*
          标题用 Display 字阶：设计稿里它明显大于正文标题，是这一屏的锚点。
          副标题只报**知识库个数**——设计稿那行还有「N 篇笔记 · N 节慕课 ·
          N 个任务」，但后端没有跨知识库的聚合端点（`/notes/list` 是
          「暂未实现」，慕课与任务都必须带 knowledgeBaseId），前端拼出来
          要么 N 次请求、要么是个会过期的假数字。
        */}
        <div className="space-y-1">
          <h1 className="text-display text-label">知识库</h1>
          <p className="text-body text-label-secondary">
            {bases.length > 0 ? `共 ${bases.length} 个知识库` : "还没有知识库"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="知识库范围"
            options={baseScopeOptions}
            value={scope}
            onChange={setScope}
          />
          <CreateBaseDialog
            defaultOpen={openCreate}
            triggerTestId="gallery-new-base"
            trigger={
              <>
                <Plus className="size-4" aria-hidden="true" />
                新建知识库
              </>
            }
            triggerClassName="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-footnote font-medium text-white outline-none transition-colors hover:bg-accent/85 focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </header>

      {failed ? (
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/5 p-6 text-footnote text-danger"
        >
          知识库加载失败：{failed.error.message}
        </p>
      ) : loading ? (
        <CardGridSkeleton />
      ) : visible.length === 0 ? (
        <EmptyScope scope={scope} />
      ) : (
        <>
          {/* 分组标题（设计稿 p03）：「最近访问」+ 计数，把网格从页头里分出来 */}
          <h2 className="flex items-baseline gap-2 pt-1 text-headline text-label">
            最近访问
            <span className="text-footnote font-normal text-label-tertiary">
              共 {bases.length} 个知识库
            </span>
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="kb-gallery-grid">
            {visible.map((base) => (
              <li key={base.id}>
                <KnowledgeBaseCard base={base} />
              </li>
            ))}
            <li>
              <CreateBaseDialog
                trigger={<CreateBaseCard />}
                triggerClassName="block h-full w-full"
              />
            </li>
          </ul>
        </>
      )}
    </section>
  );
}

function KnowledgeBaseCard({ base }: { base: KnowledgeBase }) {
  const name = base.knowledgeBaseName?.trim() || "未命名知识库";
  return (
    <Link
      href={`/notes/${base.id}`}
      data-testid={`kb-card-${base.id}`}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-lg bg-surface p-3 shadow-card outline-none transition-shadow",
        "hover:shadow-popover focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/*
        封面是**内嵌**的（设计稿里四周留 12px 白边、自身圆角 10），不是通栏出血。
        通栏会让相邻两张卡的色块连成一条色带，卡与卡的边界反而看不出来。
      */}
      <span
        aria-hidden="true"
        className={cn(coverClassName(base.id), "h-[72px] w-full rounded-md")}
      />
      <span className="flex flex-1 flex-col gap-1 px-1 pb-1 pt-3">
        <span className="truncate text-headline font-semibold text-label">{name}</span>
        <span className="truncate text-footnote text-label-secondary">
          {base.detail?.trim() ||
            formatCardMeta({ updatedAt: base.updateTime }) ||
            "还没有更新记录"}
        </span>
      </span>
    </Link>
  );
}

/**
 * 网格末尾的「新建知识库」卡：与卡片同尺寸，是画廊里的主动作。
 *
 * 它是 `CreateBaseDialog` 的触发内容（由 `group/create` 承接外层按钮的 hover），
 * 所以本身不是 `<a>`——「新建知识库」在整站只是一个对话框，不是一条 URL。
 */
function CreateBaseCard() {
  return (
    <span
      data-testid="kb-create-card"
      className={cn(
        "flex h-full min-h-[148px] flex-col justify-center gap-1.5 rounded-lg border border-dashed border-separator p-4",
        "transition-colors group-hover/create:border-accent/50 group-hover/create:bg-accent-soft/40",
      )}
    >
      <span
        aria-hidden="true"
        className="mb-1 grid size-9 place-items-center rounded-md bg-accent-soft text-accent"
      >
        <Plus className="size-5" />
      </span>
      <span className="text-headline font-semibold text-label">新建知识库</span>
      <span className="text-footnote text-label-secondary">
        为一组相关的笔记、慕课与任务创建独立空间，笔记正文将在下方自动撑满编辑区。
      </span>
    </span>
  );
}

function EmptyScope({ scope }: { scope: BaseScope }) {
  const label = baseScopeOptions.find((option) => option.value === scope)?.label ?? "";
  return (
    <div className="rounded-lg border border-dashed border-separator p-10 text-center">
      <Library className="mx-auto size-8 text-label-tertiary" aria-hidden="true" />
      <p className="mt-3 text-headline text-label">
        {scope === "all" ? "还没有知识库" : `没有「${label}」范围的知识库`}
      </p>
      <p className="mt-1 text-footnote text-label-secondary">
        先建一个知识库，笔记、慕课与任务都会归到它下面。
      </p>
    </div>
  );
}

export { baseScopes };
