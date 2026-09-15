"use client";

import { EditorSkeleton } from "@/components/loading/skeletons";
import { Spinner } from "@/components/loading/spinner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { formatHistoryTime, groupByDay } from "@/features/notes/lib/history-groups";
import { ensureLeadingHeading } from "@/features/notes/lib/leading-heading";
import { type NoteHistoryItem, historyUpdaterName } from "@/features/notes/schemas";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import {
  useNoteHistoryInfinite,
  useNoteHistoryQuery,
  useRestoreNoteVersionMutation,
} from "@/features/notes/use-note-history";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { ChevronLeft, Clock, History } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { HistoryDiffView } from "./history-diff-view";

/**
 * 只读正文走 `dynamic(..., { ssr: false })`：TipTap 整包（含 Shiki、KaTeX 桥接）
 * 是重依赖，静态引入会把它压进历史页首屏 JS（`pnpm --filter web bundle:budget` 会卡）。
 * 加载态给 `EditorSkeleton`——它与即将出现的"标题 + 参差段落"同形，
 * 加载完成时不会整块跳一下。
 */
const TiptapEditor = dynamic(
  () => import("@/components/editor/TiptapEditor").then((mod) => mod.TiptapEditor),
  { ssr: false, loading: () => <EditorSkeleton paragraphs={4} /> },
);

/** 左栏的阅读方式（D-16 图例 4）。切换不发请求：两份数据都已在手。 */
type HistoryView = "content" | "diff";

/** 右栏固定 320（画板 D-16 图例 10），不随窗口宽度伸缩。 */
const PANEL_WIDTH_CLASS = "w-80";

/**
 * `/notes/:baseId/:noteId/history`：笔记历史版本（D-16）。
 *
 * 满幅路由（`isFullBleedRoute` 已含本路径），所以这里**不画卡片**：
 * 左栏是纸面、右栏是列表，中间一条 1px 分隔线从顶栏铺到窗口下缘。
 *
 * 两条默认行为直接来自画板，都是"少点一次"的考虑：
 * 1. **默认选中第二条（上一个版本）**。用户从编辑器点进来想问的是
 *    "我这次改了什么"，当前版本就是他刚看到的那一份，选中它等于白跑一趟。
 * 2. **只有一条版本时选中它并显示空态**。那条就是当前版本，左栏没有可比较的
 *    对象，「本次改动」也拿不到上一版，所以只说明"还没有历史版本"。
 *
 * 权限：本库 `permissions > 2`（可阅读 / 无权限）时不出「恢复此版本」。
 * 后端 `PATCH /notes/{noteId}` 本来就会拒，但"点了才报无权限"正是 Q-02
 * 要求避免的形态。
 */
export function NoteHistoryPage({ baseId, noteId }: { baseId: number; noteId: number }) {
  const router = useRouter();
  const history = useNoteHistoryInfinite(noteId);
  const base = useKnowledgeBaseQuery(baseId);
  const restore = useRestoreNoteVersionMutation();

  const [view, setView] = useState<HistoryView>("content");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // 列表已按 operation_time DESC 排好，第一条即当前版本
  const items = useMemo(
    () => (history.data?.pages ?? []).flatMap((page) => page.rows),
    [history.data],
  );
  const total = history.data?.pages[0]?.total ?? items.length;

  /**
   * 默认选中「上一个版本」。
   *
   * 只在用户**还没选过**时生效（`selectedId === null`）：列表每次翻页或失效重取
   * 都会再跑一遍这个 effect，若无条件覆盖，用户翻到第 3 页挑中的版本会被悄悄换掉。
   */
  useEffect(() => {
    if (selectedId !== null || items.length === 0) return;
    const next = items[1] ?? items[0];
    setSelectedId(next?.operationLogId ?? null);
  }, [items, selectedId]);

  /** 选中项在列表里的位置，决定「上一版本」是谁、以及是不是当前版本。 */
  const selectedIndex = useMemo(
    () => items.findIndex((item) => item.operationLogId === selectedId),
    [items, selectedId],
  );
  const selected = selectedIndex >= 0 ? items[selectedIndex] : undefined;
  /** 紧挨着的更早一条；最早的版本没有上一版，整篇视为新增。 */
  const previous = selectedIndex >= 0 ? items[selectedIndex + 1] : undefined;

  const selectedOperationId = selected?.operationLogId ?? null;
  const detail = useNoteHistoryQuery(selectedOperationId);
  // 「本次改动」要两份内容，更早那一版按需取；不切到 diff 分段也能提前拿到，
  // 但只有真的需要时才发请求，所以这里跟着分段走
  const needsDiff = view === "diff";
  const previousDetail = useNoteHistoryQuery(needsDiff ? (previous?.operationLogId ?? null) : null);

  // 本库权限：1 管理 / 2 编辑可恢复，3 阅读 / 4 无权限只能看
  const canRestore = (base.data?.permissions ?? 0) <= 2;
  const isCurrent = selectedIndex === 0;
  /**
   * 没有「更早的版本」可看：列表为空，或只有一条（那条就是当前版本）。
   *
   * **两条都算**：历史快照由 `PATCH /notes/{noteId}` 触发消息队列**异步**写入，
   * 新建笔记刚打开历史页时列表是**空**的（不是一条）。只判 `length === 1`
   * 会让空列表走到下面的正文分支，那里用的 `selected` 是 `undefined` ——
   * 取 `selected.operationTime` 直接抛错，整页崩成错误边界。
   */
  const hasNoEarlierVersion = items.length <= 1;
  /*
   * 但**首次加载中不能算**：列表还没到就说"还没有历史版本"，会先闪一句假结论再被
   * 真实内容顶掉（原实现只判 `length === 1`，恰好躲过了这一帧，但代价是空列表崩）。
   *
   * 判据用 `isSuccess` 而不是 `!isPending`：这条查询没有 `staleTime`，
   * 窗口重新聚焦会触发后台重取，`isPending` 与 `isFetching` 都会再动一次，
   * 用它们做条件会让空态在已经拿到数据之后又消失（实测就是这么崩的）。
   * `isSuccess` 一旦为真就保持为真（后续重取只是 `isFetching`）。
   */
  const showEmptyState = hasNoEarlierVersion && history.isSuccess;

  const handleRestore = useCallback(async () => {
    if (!selected) return;
    const time = formatHistoryTime(selected.operationTime);
    try {
      const result = await restore.mutateAsync({
        noteId,
        title: detail.data?.title ?? "",
        content: detail.data?.content ?? "",
      });
      setConfirmOpen(false);
      if (result.status === "conflict") {
        // 留在本页（mutation 已失效列表）刷新后让用户看清版本已经变了再决定
        toast.error("笔记刚被其他会话更新，请刷新后再恢复");
        return;
      }
      toast.success(`已恢复到 ${time} 的版本`);
      // 回编辑器：mutation 已把返回值写进详情缓存，编辑器拿到的就是恢复后的正文
      router.push(`/notes/${baseId}/${noteId}`);
    } catch (error) {
      setConfirmOpen(false);
      toast.error(toUserMessage(error));
    }
  }, [baseId, detail.data, noteId, restore, router, selected]);

  return (
    <div className="flex min-h-0 w-full flex-1" data-testid="note-history-page">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface">
        {/* 顶栏分隔线铺满整列（与编辑器同口径）：内边距加在内容上、不加在 <header> 上 */}
        <header className="flex shrink-0 items-center gap-3 border-b border-separator px-6 py-3 sm:px-8">
          {/*
            「‹ 返回笔记」**保持链接语义**而不是 Button + router.push：
            这是本页唯一的出路，用按钮会丢掉新窗口打开与右键复制地址。
            Base UI 的 `Button` 无论 `nativeButton` 取值都会强制 `role="button"`
            （连 `<a>` 也盖掉），所以这里直接用 `buttonVariants` 渲染成 `<a>`
            ——与 `components/shared/states.tsx` 的返回键同一口径。
          */}
          <Link
            href={`/notes/${baseId}/${noteId}`}
            data-testid="history-back"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-accent")}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            返回笔记
          </Link>
          <span aria-hidden="true" className="h-4 w-px bg-separator" />
          <h1 className="text-footnote font-semibold text-label">历史版本</h1>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="history-scroll">
          <div className="mx-auto w-full max-w-[calc(56rem+9rem)] px-6 py-6 sm:px-8 lg:px-18">
            {showEmptyState ? (
              // 只有一条版本：那条就是当前版本，没有可比对的更早内容
              <div data-testid="history-empty">
                <EmptyState
                  icon={History}
                  title="这篇笔记还没有历史版本"
                  hint="之后每次保存都会在这里留下一个版本。"
                />
              </div>
            ) : (
              <article className="flex w-full flex-col gap-4">
                <ViewBanner
                  item={selected}
                  canRestore={canRestore && !isCurrent && !hasNoEarlierVersion}
                  restoring={restore.isPending}
                  onRestore={() => setConfirmOpen(true)}
                />

                <Segmented
                  label="阅读方式"
                  value={view}
                  onChange={(next) => setView(next as HistoryView)}
                  options={[
                    { value: "content", label: "正文" },
                    { value: "diff", label: "本次改动" },
                  ]}
                  className="self-start"
                />

                <VersionBody
                  view={view}
                  detail={detail}
                  previousDetail={previousDetail}
                  hasPrevious={previous !== undefined}
                />
              </article>
            )}
          </div>
        </div>
      </section>

      <VersionPanel
        items={items}
        total={total}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={history.isPending}
        error={history.isError ? history.error : null}
        onRetry={() => void history.refetch()}
        retrying={history.isRefetching}
        hasNextPage={history.hasNextPage}
        fetchingNextPage={history.isFetchingNextPage}
        onLoadMore={() => void history.fetchNextPage()}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="恢复到这个版本？"
        description={
          selected
            ? `正文会回到 ${historyUpdaterName(selected)} · ${formatHistoryTime(selected.operationTime)} 的样子。当前内容会先作为一个新版本保留在历史记录里，随时可以再换回来。`
            : ""
        }
        confirmLabel="恢复"
        pendingLabel="恢复中…"
        pending={restore.isPending}
        onConfirm={() => void handleRestore()}
      />
    </div>
  );
}

/**
 * 左栏顶部的提示条 + 「恢复此版本」（图例 6 / 5）。
 *
 * 提示条存在的唯一理由是**与编辑器区分**：这页的正文长得和编辑器一模一样，
 * 不明说的话用户会以为可以直接改（改不了），或者以为刚才的编辑丢了。
 *
 * 恢复键与它同一行而不是浮在正文上方：两者回答的是同一个问题——
 * "我在看哪一版、要不要换回去"。
 */
function ViewBanner({
  item,
  canRestore,
  restoring,
  onRestore,
}: {
  item: NoteHistoryItem | undefined;
  canRestore: boolean;
  restoring: boolean;
  onRestore: () => void;
}) {
  if (!item) return null;
  return (
    <div
      data-testid="history-banner"
      className="flex min-h-11 flex-wrap items-center gap-3 rounded-xl bg-grouped px-3 py-1.5"
    >
      <Clock className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-footnote text-label" data-testid="history-viewing">
        正在查看 {historyUpdaterName(item)} 于 {formatHistoryTime(item.operationTime)} 保存的版本
      </p>
      {canRestore ? (
        <Button
          className="h-[34px] shrink-0"
          disabled={restoring}
          onClick={onRestore}
          data-testid="history-restore"
        >
          恢复此版本
        </Button>
      ) : null}
    </div>
  );
}

/**
 * 左栏的正文区（图例 8 / 9）。
 *
 * 加载态**只换正文与标题**，提示条与右栏列表不受影响（图例 16）：
 * 换版本时反复闪一整屏骨架，会让人以为整页在重载。
 */
function VersionBody({
  view,
  detail,
  previousDetail,
  hasPrevious,
}: {
  view: HistoryView;
  detail: ReturnType<typeof useNoteHistoryQuery>;
  previousDetail: ReturnType<typeof useNoteHistoryQuery>;
  hasPrevious: boolean;
}) {
  if (view === "diff") {
    const currentContent = detail.data?.content ?? "";
    // 最早的版本没有上一版：整篇视为新增，符合"这次保存把全文写进来了"的事实
    const previousContent = hasPrevious ? (previousDetail.data?.content ?? "") : "";
    // 两份内容都齐了才渲染差异，否则会先闪一屏"全部新增"再纠正回来
    if (detail.isPending || (hasPrevious && previousDetail.isPending)) {
      return <EditorSkeleton paragraphs={4} />;
    }
    if (detail.isError) {
      return (
        <QueryError
          object="这个版本"
          message={toUserMessage(detail.error)}
          onRetry={() => void detail.refetch()}
          retrying={detail.isRefetching}
        />
      );
    }
    if (hasPrevious && previousDetail.isError) {
      return (
        <QueryError
          object="上一个版本"
          message={toUserMessage(previousDetail.error)}
          onRetry={() => void previousDetail.refetch()}
          retrying={previousDetail.isRefetching}
        />
      );
    }
    return <HistoryDiffView previousContent={previousContent} currentContent={currentContent} />;
  }

  if (detail.isPending) {
    return <EditorSkeleton paragraphs={4} />;
  }
  if (detail.isError) {
    return (
      <QueryError
        object="这个版本"
        message={toUserMessage(detail.error)}
        onRetry={() => void detail.refetch()}
        retrying={detail.isRefetching}
      />
    );
  }
  return (
    <>
      {/* 版本标题与编辑器 H1 同字阶（图例 8）：这是同一篇文章，不该换一种长相 */}
      <h2 className="text-display font-bold text-label" data-testid="history-version-title">
        {detail.data?.title?.trim() || "未命名笔记"}
      </h2>
      <div data-testid="history-version-content">
        <TiptapEditor
          preset="readonly"
          value={ensureLeadingHeading(detail.data?.content ?? "", detail.data?.title)}
        />
      </div>
    </>
  );
}

/**
 * 右栏历史记录面板（图例 10–15）。
 *
 * 滚到底自动翻页用 `IntersectionObserver` 盯一个哨兵元素，而不是监听 scroll 事件：
 * 滚动回调每帧都跑、还要自己算"离底还有多远"，而 observer 只在进入视口时响一次。
 */
function VersionPanel({
  items,
  total,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  retrying,
  hasNextPage,
  fetchingNextPage,
  onLoadMore,
}: {
  items: NoteHistoryItem[];
  total: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  hasNextPage: boolean;
  fetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(() => groupByDay(items), [items]);

  useEffect(() => {
    const node = sentinel.current;
    // jsdom 没有 IntersectionObserver；没有它时退化成"只能看第一页"，不影响渲染
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && hasNextPage && !fetchingNextPage) {
        onLoadMore();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, fetchingNextPage, onLoadMore]);

  return (
    <aside
      data-testid="history-panel"
      className={cn(
        "flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-separator bg-surface",
        PANEL_WIDTH_CLASS,
      )}
    >
      <div className="flex shrink-0 items-baseline gap-2 border-b border-separator px-4 py-3">
        <h2 className="text-headline font-semibold text-label">历史记录</h2>
        <span className="text-xs text-label-secondary" data-testid="history-total">
          共 {total} 个版本
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="history-list">
        {loading ? (
          <p className="px-2 py-3 text-footnote text-label-secondary">正在加载版本…</p>
        ) : error ? (
          <QueryError
            object="历史版本"
            message={toUserMessage(error)}
            onRetry={onRetry}
            retrying={retrying}
            compact
          />
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.label} className="mb-2">
                {/* 分组标题（图例 11）：今天 / 昨天 / 09-12 周六 */}
                <p className="px-2 py-1 text-xs font-semibold text-label-tertiary">{group.label}</p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.operationLogId}>
                      <VersionRow
                        item={item}
                        selected={item.operationLogId === selectedId}
                        current={item.operationLogId === items[0]?.operationLogId}
                        onSelect={() => onSelect(item.operationLogId)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* 翻页哨兵与状态位（图例 15） */}
            <div ref={sentinel} data-testid="history-sentinel" className="h-1" />
            <p
              className="flex items-center justify-center gap-1.5 py-2 text-xs text-label-tertiary"
              data-testid="history-more"
            >
              {hasNextPage ? (
                <>
                  {fetchingNextPage ? <Spinner size="inline" /> : null}
                  滚动加载更早的版本
                </>
              ) : (
                "没有更早的版本了"
              )}
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

/**
 * 版本行（图例 12 / 13 / 14）。
 *
 * 选中态同时有底色、左侧竖条与昵称字重三处变化：只给底色的话，
 * 深色下 `accent/tint` 与背景的对比度很低，"选中了哪一条"要凑近看。
 */
function VersionRow({
  item,
  selected,
  current,
  onSelect,
}: {
  item: NoteHistoryItem;
  selected: boolean;
  current: boolean;
  onSelect: () => void;
}) {
  const name = historyUpdaterName(item);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`history-row-${item.operationLogId}`}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "flex min-h-14 w-full items-center gap-2.5 rounded-md py-2 pr-2 text-left outline-none transition-colors",
        // 左侧 3px 竖条：不选中时用透明边框占位，选中时文字不会横向跳一下
        "border-l-[3px]",
        selected
          ? "border-accent bg-accent-soft"
          : "border-transparent hover:bg-fill-hover focus-visible:bg-fill-hover",
        "focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span
        aria-hidden="true"
        // 竖条吃掉 3px，左侧内边距相应减掉，昵称左右缘与分组标题对齐
        className="ml-1.5 grid size-7 shrink-0 place-items-center rounded-full bg-fill-hover text-xs font-medium text-label-secondary"
      >
        {name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-footnote",
            selected ? "font-semibold text-accent" : "font-medium text-label",
          )}
        >
          {name}
        </span>
        <span className="block truncate text-xs tabular-nums text-label-secondary">
          {formatHistoryTime(item.operationTime)}
        </span>
      </span>
      {current ? (
        <Badge variant="default" data-testid={`history-current-${item.operationLogId}`}>
          当前版本
        </Badge>
      ) : null}
    </button>
  );
}
