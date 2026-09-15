"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { NotFoundState, QueryError } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Film, ListTree } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { VideoPlayer } from "./video-player";

/**
 * `/notes/[baseId]/mooc/[moocId]`：左侧条目列表（章节展开子条目），右侧视频播放
 * （DPlayer）或文档阅读（只读编辑器）。条目类型：0 章节 / 1 视频 / 2 文档（D-06）。
 */
export function MoocDetailPage({ baseId, moocId }: { baseId: number; moocId: number }) {
  const queryClient = useQueryClient();
  const mooc = useMoocQuery(moocId);
  const [selected, setSelected] = useState<MoocItem | null>(null);
  const [chapter, setChapter] = useState<MoocItem | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // 「自动选中第一个视频」只做一次：用户手动收起章节后不能再被强行拉回去
  const autoSelected = useRef(false);

  const items = useMoocItemsQuery(moocId, 0);
  const selectedId = selected?.id ?? null;

  /**
   * 选中一个条目，并记下它属于哪一章。
   *
   * `parent` 由**点击它的那一层**给出，而不是在这里反查：这正是本条缺陷的修法——
   * 子条目必须自己说明归属，才能同时做到"选中自己"与"不收起父章节"。
   */
  const selectItem = useCallback((item: MoocItem, parent: MoocItem | null) => {
    setSelected(item);
    setChapter(parent);
    // 选中的是章节里的条目时顺手展开父章节，左侧目录要能对上右侧内容
    if (parent) setExpandedId(parent.id);
  }, []);

  /**
   * 按需取某一级条目，走 Query 缓存（`fetchQuery` 命中缓存就不再发请求）。
   * 目录遍历与「下一节」都用它，因此同一章的条目在两条路径间共享缓存，
   * 而且左侧目录展开时用 `useMoocItemsQuery` 取过的章节不会重复请求。
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

  // 进入页面默认选中目录里的第一个视频（D-06 图例 21：不再停在"请从左侧选择"）
  useEffect(() => {
    if (autoSelected.current || !items.data) return;
    autoSelected.current = true;
    void firstPlayable(loadItems).then((node) => {
      if (!node) return;
      selectItem(node.item, node.chapter);
    });
  }, [items.data, loadItems, selectItem]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4" data-testid="mooc-detail">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" render={<Link href={`/notes/${baseId}/mooc`} />}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          慕课
        </Button>
        {/*
          Display 字阶的课程名来自 `useMoocQuery`：详情页此前只有"返回课程列表"，
          用户看不出自己在哪门课里（D-06 图例 3）。
        */}
        {mooc.isPending ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <h1 className="text-display text-label">{mooc.data?.title?.trim() || "未命名课程"}</h1>
        )}
      </div>

      {mooc.isError ? (
        <NotFoundState object="课程" backHref={`/notes/${baseId}/mooc`} backLabel="回到慕课" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          <aside className="rounded-xl border p-2">
            {items.isPending ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : items.isError ? (
              <QueryError
                object="条目"
                message={toUserMessage(items.error)}
                onRetry={() => void items.refetch()}
                retrying={items.isFetching}
                compact
              />
            ) : items.data.length === 0 ? (
              <p className="flex items-center gap-2 p-4 text-sm text-label-secondary">
                <ListTree className="size-4" aria-hidden="true" />
                这门课还没有章节内容
              </p>
            ) : (
              <ul className="space-y-1">
                {items.data.map((item) => (
                  <MoocItemRow
                    key={item.id}
                    moocId={moocId}
                    item={item}
                    chapter={null}
                    selectedId={selectedId}
                    expanded={expandedId === item.id}
                    onSelect={selectItem}
                    onToggle={() => {
                      setExpandedId(expandedId === item.id ? null : item.id);
                    }}
                  />
                ))}
              </ul>
            )}
          </aside>

          <div className="min-w-0">
            {selected ? (
              <SelectedItemPanel
                moocId={moocId}
                item={selected}
                chapter={chapter}
                onNavigate={selectItem}
                loadItems={loadItems}
              />
            ) : (
              <div className="flex h-66 items-center justify-center rounded-xl border border-dashed text-footnote text-label-secondary">
                从左侧选择章节、视频或文档开始学习。
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function MoocItemRow({
  moocId,
  item,
  chapter,
  selectedId,
  expanded,
  onSelect,
  onToggle,
}: {
  moocId: number;
  item: MoocItem;
  chapter: MoocItem | null;
  selectedId: number | null;
  expanded: boolean;
  onSelect: (item: MoocItem, chapter: MoocItem | null) => void;
  onToggle: () => void;
}) {
  const isChapter = item.moocItemType === MOOC_ITEM_TYPE.CHAPTER;

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md text-sm transition-colors",
          selectedId === item.id ? "bg-accent-soft text-accent" : "hover:bg-fill-hover",
        )}
      >
        {isChapter ? (
          <button
            type="button"
            className="cursor-pointer p-1.5 outline-none"
            aria-label={expanded ? "收起章节" : "展开章节"}
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {expanded ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="w-6" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1 py-2 text-left outline-none"
          onClick={() => {
            onSelect(item, chapter);
          }}
          data-testid={`mooc-item-${item.id}`}
          aria-current={selectedId === item.id ? "true" : undefined}
        >
          <ItemIcon type={item.moocItemType} />
          <span className="min-w-0 flex-1 truncate" title={item.title ?? "未命名条目"}>
            {item.title ?? "未命名条目"}
          </span>
          <span className="shrink-0 text-xs text-label-secondary">
            {moocItemTypeName(item.moocItemType)}
          </span>
        </button>
      </div>
      {isChapter && expanded ? (
        <ChapterChildren
          moocId={moocId}
          parent={item}
          selectedId={selectedId}
          onSelectItem={onSelect}
        />
      ) : null}
    </li>
  );
}

/**
 * 章节下的子条目。
 *
 * **接过 `onSelectItem(child, parent)` 而不是父级那个无参 `onSelect`**——
 * 这正是 M12.2 要修的缺陷：原实现把父级的回调原样传下来，点子条目执行的是
 * "选中父章节 + 收起父章节"，视频永远打不开。子条目此刻必须能说明
 * "我是谁、我属于哪一章"。
 */
function ChapterChildren({
  moocId,
  parent,
  selectedId,
  onSelectItem,
}: {
  moocId: number;
  parent: MoocItem;
  selectedId: number | null;
  onSelectItem: (item: MoocItem, chapter: MoocItem | null) => void;
}) {
  const children = useMoocItemsQuery(moocId, parent.id);
  if (children.isPending) {
    return <Skeleton className="ml-8 h-8 w-40 rounded-md" />;
  }
  const childRows = children.data ?? [];
  if (childRows.length === 0) {
    return <p className="ml-8 py-1 text-xs text-label-secondary">章节下暂无内容</p>;
  }
  return (
    <ul className="ml-6 space-y-1 border-l pl-2">
      {childRows.map((child) => (
        <li key={child.id}>
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors",
              selectedId === child.id ? "bg-accent-soft text-accent" : "hover:bg-fill-hover",
            )}
            onClick={() => {
              onSelectItem(child, parent);
            }}
            aria-current={selectedId === child.id ? "true" : undefined}
          >
            <ItemIcon type={child.moocItemType} />
            <span className="min-w-0 flex-1 truncate">{child.title ?? "未命名条目"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ItemIcon({ type }: { type: number | null | undefined }) {
  if (type === MOOC_ITEM_TYPE.VIDEO) {
    return <Film className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />;
  }
  if (type === MOOC_ITEM_TYPE.DOC) {
    return <FileText className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />;
  }
  return <ListTree className="size-4 shrink-0 text-label-secondary" aria-hidden="true" />;
}

function SelectedItemPanel({
  moocId,
  item,
  chapter,
  onNavigate,
  loadItems,
}: {
  moocId: number;
  item: MoocItem;
  chapter: MoocItem | null;
  onNavigate: (item: MoocItem, chapter: MoocItem | null) => void;
  loadItems: (parentId: number) => Promise<MoocItem[]>;
}) {
  const detail = useMoocItemQuery(moocId, item.id);
  const isVideo = (detail.data?.moocItemType ?? item.moocItemType) === MOOC_ITEM_TYPE.VIDEO;
  const objectName = detail.data?.objectName ?? item.objectName;
  const objectUrl = useObjectUrlQuery(isVideo ? (objectName ?? null) : null);
  const [next, setNext] = useState<CatalogNode | null>(null);

  /*
   * 「下一节」在渲染后按需算：它可能要跨章节取子条目，属于"走到才知道"的
   * 命令式读取，不该在渲染期同步发请求。切换条目时先清空，避免用户看到
   * 上一条目的下一节。
   */
  useEffect(() => {
    let cancelled = false;
    setNext(null);
    void nextPlayable(loadItems, item.id).then((node) => {
      if (!cancelled) setNext(node);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, loadItems]);

  const typeName = moocItemTypeName(detail.data?.moocItemType ?? item.moocItemType);
  // 「在「第 1 章」中」只在条目确实挂在章节下时才显示（顶层条目没有章节）
  const locationText = chapter
    ? `${typeName} · 在「${chapter.title ?? "未命名章节"}」中`
    : typeName;

  return (
    <div className="space-y-3" data-testid="mooc-item-panel">
      <h2 className="text-lg font-semibold">{detail.data?.title ?? item.title ?? "未命名条目"}</h2>
      <p className="text-footnote text-label-tertiary">{locationText}</p>
      {isVideo ? (
        objectUrl.isPending ? (
          // 这里保留 16:9 的播放器占位而不是 DocumentSkeleton：后者是 A4 纸面比例
          // （竖版 1:1.414），套在视频位上是"形状对不上宿主"，加载完成时会整块塌缩。
          <Skeleton className="aspect-video w-full rounded-lg" />
        ) : objectUrl.isError || !objectUrl.data?.url ? (
          <div
            role="alert"
            className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-6"
          >
            <p className="text-sm text-danger">视频地址获取失败，请稍后重试。</p>
            <Button
              variant="outline"
              size="sm"
              disabled={objectUrl.isFetching}
              onClick={() => void objectUrl.refetch()}
            >
              重新获取
            </Button>
          </div>
        ) : (
          <VideoPlayer url={objectUrl.data.url} title={item.title ?? undefined} />
        )
      ) : detail.isPending ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : detail.data?.moocItemText?.content ? (
        <div className="rounded-xl border bg-surface p-4">
          <TiptapEditor preset="readonly" value={detail.data.moocItemText.content} />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-label-secondary">
          这个条目还没有内容。
        </p>
      )}

      {next ? (
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onNavigate(next.item, next.chapter);
              // 滚回顶部：下一节通常是整段视频，停在页面底部会看不见播放器
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            下一节
          </Button>
        </div>
      ) : null}
    </div>
  );
}
