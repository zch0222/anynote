"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { EmptyState, QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoPlayer } from "@/features/mooc/components/video-player";
import { type CatalogNode, firstPlayable, nextPlayable } from "@/features/mooc/lib/catalog";
import { moocQueryKeys } from "@/features/mooc/query-keys";
import { MOOC_ITEM_TYPE, type MoocItem, moocItemTypeName } from "@/features/mooc/schemas";
import {
  fetchMoocItems,
  useMoocItemQuery,
  useMoocItemsQuery,
  useMoocQuery,
  useObjectUrlQuery,
} from "@/features/mooc/use-moocs";
import { toUserMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileText, Film, ListTree, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const MODE_OPTIONS = [
  { value: "catalog", label: "目录" },
  { value: "content", label: "内容" },
] as const;

type Mode = (typeof MODE_OPTIONS)[number]["value"];

/**
 * `/m/notes/[baseId]/mooc/[moocId]`：课程详情（M-06）。
 *
 * 桌面是 `lg:grid-cols-[20rem_1fr]` 的目录 + 内容双栏，手机上拆成「目录 / 内容」
 * 两屏用分段控件切换，选中条目后自动切到内容——否则每看一节都要手动切两次。
 *
 * 与旧实现（`/m/mooc/[id]`）的三处差别：
 * 1. 顶栏固定显示**课程名**（`useMoocQuery`）。旧实现显示所选条目，离开目录后
 *    就看不出在哪门课里了。
 * 2. 返回兜底回**本库的慕课 Tab**，而不是跨库的 `/m/mooc`。
 * 3. 内容区给出「所在章节」与「下一节」，并保留「重新获取」——
 *    播放地址是临时签名 URL，过期后需要单独换一个（整页重载会丢掉播放进度）。
 */
export function MobileMoocDetail({ baseId, moocId }: { baseId: number; moocId: number }) {
  const queryClient = useQueryClient();
  const mooc = useMoocQuery(moocId);
  const [selected, setSelected] = useState<MoocItem | null>(null);
  const [chapter, setChapter] = useState<MoocItem | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("catalog");
  const [next, setNext] = useState<CatalogNode | null>(null);
  const items = useMoocItemsQuery(moocId, 0);

  /**
   * 按需取某一级条目，走 Query 缓存（`fetchQuery` 命中缓存就不再发请求）。
   *
   * 与桌面 D-06 是同一份选择逻辑（`lib/catalog.ts`）：目录遍历与「下一节」
   * 都用它，因此同一章的条目在两条路径间共享缓存，目录里展开过的章节
   * 也不会被重复请求。§1.4 那条「子条目打不开」的缺陷在两端共用一个修复。
   */
  const loadItems = useCallback(
    (parentId: number) =>
      queryClient.fetchQuery({
        queryKey: moocQueryKeys.items(moocId, parentId),
        queryFn: () => fetchMoocItems(moocId, parentId),
        staleTime: 5 * 60_000,
      }),
    [moocId, queryClient],
  );

  const selectItem = useCallback((item: MoocItem, parent: MoocItem | null) => {
    setSelected(item);
    setChapter(parent);
    if (item.moocItemType === MOOC_ITEM_TYPE.CHAPTER) {
      // 章节自身只是容器：点它只展开 / 收起，不切走「目录」（图例 M-06）
      setExpandedId((current) => (current === item.id ? null : item.id));
      return;
    }
    // 选中视频 / 文档后自动切到「内容」，省一次手动切换
    setMode("content");
  }, []);

  /**
   * 进入页面默认选中目录里的第一个视频 / 文档（与桌面的 D-06 图例 21 同一条规则）。
   *
   * 只做一次：用户手动切回「目录」后不能再被强行拉回内容页。
   */
  const autoSelected = useRef(false);
  useEffect(() => {
    if (autoSelected.current || !items.data) return;
    autoSelected.current = true;
    void firstPlayable(loadItems).then((node) => {
      if (node) selectItem(node.item, node.chapter);
    });
  }, [items.data, loadItems, selectItem]);

  /** 「下一节」按目录顺序算：它要跨章节往下找，不能只看当前这一层。 */
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    setNext(null);
    if (selectedId === null) return;
    void nextPlayable(loadItems, selectedId).then((node) => {
      if (!cancelled) setNext(node);
    });
    return () => {
      cancelled = true;
    };
  }, [loadItems, selectedId]);

  return (
    <MobileScreen
      title={mooc.data?.title?.trim() || "课程"}
      back={`/m/notes/${baseId}/mooc`}
      tone="paper"
    >
      <div className="space-y-3 p-4" data-testid="mobile-mooc-detail">
        <Segmented
          label="课程视图"
          shape="pill"
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          className="w-full [&>button]:flex-1"
        />

        {mode === "catalog" ? (
          items.isPending ? (
            <ListRowsSkeleton count={3} />
          ) : items.isError ? (
            <QueryError
              object="条目"
              message={toUserMessage(items.error)}
              onRetry={() => void items.refetch()}
              retrying={items.isFetching}
            />
          ) : (items.data?.length ?? 0) === 0 ? (
            <EmptyState icon={ListTree} title="这门课还没有章节内容" hint="章节下暂无内容" />
          ) : (
            <ul className="overflow-hidden rounded-lg bg-surface">
              {items.data?.map((item) => (
                <MoocItemRow
                  key={item.id}
                  moocId={moocId}
                  item={item}
                  showDivider
                  selectedId={selected?.id ?? null}
                  expanded={expandedId === item.id}
                  onSelect={selectItem}
                />
              ))}
            </ul>
          )
        ) : selected ? (
          <MoocItemPanel
            moocId={moocId}
            item={selected}
            chapterTitle={chapter?.title ?? null}
            nextItem={next}
            onNext={selectItem}
          />
        ) : (
          <EmptyState title="还没有选择内容" hint="先从「目录」里选一个章节、视频或文档。" />
        )}
      </div>
    </MobileScreen>
  );
}

function MoocItemRow({
  moocId,
  item,
  selectedId,
  expanded,
  showDivider,
  onSelect,
}: {
  moocId: number;
  item: MoocItem;
  selectedId: number | null;
  expanded: boolean;
  showDivider?: boolean;
  onSelect: (item: MoocItem, chapter: MoocItem | null) => void;
}) {
  const selected = selectedId === item.id;
  const isChapter = item.moocItemType === MOOC_ITEM_TYPE.CHAPTER;
  return (
    <li className={showDivider ? "border-b border-separator last:border-b-0" : undefined}>
      <button
        type="button"
        // 顶层条目没有父章节（章节自己点了只展开）
        onClick={() => onSelect(item, null)}
        aria-expanded={isChapter ? expanded : undefined}
        data-testid={`mooc-item-${item.id}`}
        className={cn(
          "flex min-h-12 w-full items-center gap-2 px-4 text-left text-footnote outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          selected ? "bg-accent-soft text-accent" : "hover:bg-fill-hover",
        )}
      >
        <ItemIcon type={item.moocItemType} />
        <span className="min-w-0 flex-1 truncate">{item.title?.trim() || "未命名条目"}</span>
        <span className="shrink-0 text-xs text-label-tertiary">
          {moocItemTypeName(item.moocItemType)}
        </span>
        {isChapter ? (
          expanded ? (
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
          )
        ) : null}
      </button>
      {isChapter && expanded ? (
        <ChapterChildren
          moocId={moocId}
          chapter={item}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : null}
    </li>
  );
}

/**
 * 章节下的子条目。
 *
 * 子条目点击**只走 `onSelect(child)`**：`onSelect` 内部按类型分流，
 * 章节才展开、其余条目切到内容。旧实现在这里把父级的 `onSelect` 原样传下来
 * 并额外折叠父章节（`mooc-detail.tsx` 的老写法），结果是点子条目 = 收起章节，
 * 内容根本打不开（方案 §2 第 1 条）。移动端与 12.2.4 的修复保持同一语义。
 */
function ChapterChildren({
  moocId,
  chapter,
  selectedId,
  onSelect,
}: {
  moocId: number;
  chapter: MoocItem;
  selectedId: number | null;
  onSelect: (item: MoocItem, chapter: MoocItem | null) => void;
}) {
  const children = useMoocItemsQuery(moocId, chapter.id);
  const rows = children.data;

  if (children.isPending) {
    return <Skeleton className="mx-4 mb-2 h-10 rounded-md" />;
  }
  if (children.isError) {
    return (
      <div className="px-4 pb-2">
        <QueryError
          object="章节内容"
          message={toUserMessage(children.error)}
          onRetry={() => void children.refetch()}
          retrying={children.isFetching}
          compact
        />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return <p className="px-10 py-2 text-xs text-label-tertiary">章节下暂无内容</p>;
  }
  return (
    <ul className="bg-fill-hover/50">
      {rows.map((child) => (
        <li key={child.id}>
          <button
            type="button"
            // 带上所属章节：「所在章节」那一行与「下一节」都要知道自己在哪一章
            onClick={() => onSelect(child, chapter)}
            data-testid={`mooc-item-${child.id}`}
            className={cn(
              "flex min-h-12 w-full items-center gap-2 pl-10 pr-4 text-left text-footnote outline-none",
              "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              selectedId === child.id ? "bg-accent-soft text-accent" : "hover:bg-fill-hover",
            )}
          >
            <ItemIcon type={child.moocItemType} />
            <span className="min-w-0 flex-1 truncate">{child.title?.trim() || "未命名条目"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ItemIcon({ type }: { type: number | null | undefined }) {
  if (type === MOOC_ITEM_TYPE.VIDEO) {
    return <Film className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />;
  }
  if (type === MOOC_ITEM_TYPE.DOC) {
    return <FileText className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />;
  }
  return <ListTree className="size-4 shrink-0 text-label-tertiary" aria-hidden="true" />;
}

/**
 * 视频 / 文档内容面板。
 *
 * 播放地址是临时签名 URL，由 `useObjectUrlQuery` 现取现用；签名过期后点
 * 「重新获取」单独换一个，不用整页重载（重载会丢掉目录展开状态与播放进度）。
 */
function MoocItemPanel({
  moocId,
  item,
  chapterTitle,
  nextItem,
  onNext,
}: {
  moocId: number;
  item: MoocItem;
  chapterTitle: string | null;
  nextItem: CatalogNode | null;
  onNext: (item: MoocItem, chapter: MoocItem | null) => void;
}) {
  const detail = useMoocItemQuery(moocId, item.id);
  const isVideo = (detail.data?.moocItemType ?? item.moocItemType) === MOOC_ITEM_TYPE.VIDEO;
  const objectName = detail.data?.objectName ?? item.objectName;
  const objectUrl = useObjectUrlQuery(isVideo ? (objectName ?? null) : null);

  const refresh = () => {
    void detail.refetch();
    if (isVideo) void objectUrl.refetch();
  };

  return (
    <div className="space-y-3" data-testid="mooc-item-panel">
      {/* 图例 M-06 #13：所在章节。视频 · 第 1 章 —— 顶层条目没有父章节就不拼这一段 */}
      <p className="text-footnote text-label-tertiary" data-testid="mooc-item-breadcrumb">
        {moocItemTypeName(detail.data?.moocItemType ?? item.moocItemType)}
        {chapterTitle ? ` · ${chapterTitle}` : ""}
      </p>
      <h2 className="text-headline font-semibold text-label">
        {detail.data?.title?.trim() || item.title?.trim() || "未命名条目"}
      </h2>

      {isVideo ? (
        objectUrl.isPending ? (
          // 视频位保留 16:9 播放器比例：DocumentSkeleton 是 A4 竖版纸面，
          // 塞进视频槽位会在加载完成时整块塌缩（形状要跟着宿主走）。
          <Skeleton className="aspect-video w-full rounded-lg" />
        ) : objectUrl.isError || !objectUrl.data?.url ? (
          <QueryError
            object="视频地址"
            message={toUserMessage(objectUrl.error ?? new Error("播放地址为空"))}
            onRetry={refresh}
            retrying={objectUrl.isFetching}
          />
        ) : (
          <VideoPlayer url={objectUrl.data.url} title={item.title ?? undefined} />
        )
      ) : detail.isPending ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : detail.isError ? (
        <QueryError
          object="内容"
          message={toUserMessage(detail.error)}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      ) : detail.data?.moocItemText?.content ? (
        <div className="rounded-lg border border-separator bg-surface p-3">
          <TiptapEditor preset="readonly" value={detail.data.moocItemText.content} />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-separator p-6 text-center text-footnote text-label-secondary">
          这个条目还没有内容。
        </p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        {/* 图例 M-06 #14：最后一节隐藏「下一节」，否则会给出一个点不动的按钮 */}
        {nextItem ? (
          <Button
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => onNext(nextItem.item, nextItem.chapter)}
            data-testid="mooc-next-item"
          >
            下一节：{nextItem.item.title?.trim() || "未命名条目"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="min-h-11 w-full text-accent"
          onClick={refresh}
          data-testid="mooc-refresh-url"
        >
          <RotateCw className="size-4" aria-hidden="true" />
          重新获取
        </Button>
      </div>
    </div>
  );
}
