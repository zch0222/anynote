"use client";

import { CardGridSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Segmented } from "@/components/ui/segmented";
import { useMe } from "@/features/auth/use-me";
import { type BaseScopeSource, selectBases } from "@/features/notes/lib/base-scope";
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
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
/*
 * 「新建知识库」对话框按需加载（与移动端同款处理）：它顶层引着 react-hook-form
 * 与整棵表单原子，而 `CreateBaseDialog` 在画廊与新建笔记页都只是"点开才需要"的
 * 一个入口。静态引入会把这条依赖树压进 `/notes` 的首屏——实测这一步就是
 * 桌面首屏超出 300KB 预算的主因之一。`ssr: false`：对话框只在点击后才渲染。
 */
const CreateBaseDialog = dynamic(
  () => import("./create-base-dialog").then((mod) => mod.CreateBaseDialog),
  { ssr: false },
);

/** 画廊只铺一屏放得下的量；再多交给搜索。 */
const GALLERY_LIMIT = 12;

/**
 * 分段筛选与它的类型已抽到 `lib/base-scope.ts`（移动端 `/m/notes` 也要用它，
 * 而那份文件顶层引着整棵画框图）。这里**再导出**，桌面的调用方与测试
 * import 路径不用改；真相只有 lib 里那一份。
 */
export { type BaseScopeSource, selectBases } from "@/features/notes/lib/base-scope";

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
        <QueryError
          object="知识库"
          error={failed.error}
          onRetry={() => void failed.refetch()}
          retrying={failed.isFetching}
        />
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
    <EmptyState
      icon={Library}
      title={scope === "all" ? "还没有知识库" : `没有「${label}」范围的知识库`}
      hint="先建一个知识库，笔记、慕课与任务都会归到它下面。"
    />
  );
}

export { baseScopes };
