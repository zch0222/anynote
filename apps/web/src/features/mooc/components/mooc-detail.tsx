"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MOOC_ITEM_TYPE, type MoocItem, moocItemTypeName } from "@/features/mooc/schemas";
import { useMoocItemQuery, useMoocItemsQuery, useObjectUrlQuery } from "@/features/mooc/use-moocs";
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Film, ListTree } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { VideoPlayer } from "./video-player";

/**
 * `/mooc/[id]`：左侧条目列表（章节展开子条目），右侧视频播放（DPlayer）或文档阅读
 * （只读编辑器）。条目类型：0 章节 / 1 视频 / 2 文档。
 */
export function MoocDetailPage({ moocId }: { moocId: number }) {
  const [selectedItem, setSelectedItem] = useState<MoocItem | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const items = useMoocItemsQuery(moocId, 0);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4" data-testid="mooc-detail">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/mooc" />}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          返回课程列表
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <aside className="rounded-xl border p-2">
          {items.isPending ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : items.isError ? (
            <p className="p-2 text-sm text-destructive">条目加载失败：{items.error.message}</p>
          ) : items.data.length === 0 ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
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
                  selected={selectedItem?.id === item.id}
                  expanded={expandedId === item.id}
                  onSelect={() => {
                    setSelectedItem(item);
                    if (item.moocItemType === MOOC_ITEM_TYPE.CHAPTER) {
                      setExpandedId(expandedId === item.id ? null : item.id);
                    }
                  }}
                  onToggle={() => {
                    setExpandedId(expandedId === item.id ? null : item.id);
                  }}
                />
              ))}
            </ul>
          )}
        </aside>

        <div className="min-w-0">
          {selectedItem ? (
            <SelectedItemPanel moocId={moocId} item={selectedItem} />
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              从左侧选择章节、视频或文档开始学习。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MoocItemRow({
  moocId,
  item,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  moocId: number;
  item: MoocItem;
  selected: boolean;
  expanded: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const isChapter = item.moocItemType === MOOC_ITEM_TYPE.CHAPTER;

  return (
    <li>
      <div
        className={`flex items-center gap-1 rounded-lg text-sm transition-colors ${
          selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
        }`}
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
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-1 py-2 text-left outline-none"
          onClick={onSelect}
          data-testid={`mooc-item-${item.id}`}
        >
          <ItemIcon type={item.moocItemType} />
          <span className="min-w-0 flex-1 truncate" title={item.title ?? "未命名条目"}>
            {item.title ?? "未命名条目"}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {moocItemTypeName(item.moocItemType)}
          </span>
        </button>
      </div>
      {isChapter && expanded ? (
        <ChapterChildren moocId={moocId} parentId={item.id} onSelect={onSelect} />
      ) : null}
    </li>
  );
}

function ChapterChildren({
  moocId,
  parentId,
  onSelect,
}: {
  moocId: number;
  parentId: number;
  onSelect: () => void;
}) {
  const children = useMoocItemsQuery(moocId, parentId);
  if (children.isPending) {
    return <Skeleton className="ml-8 h-8 w-40 rounded-lg" />;
  }
  const childRows = children.data ?? [];
  if (childRows.length === 0) {
    return <p className="ml-8 py-1 text-xs text-muted-foreground">章节下暂无内容</p>;
  }
  return (
    <ul className="ml-6 space-y-1 border-l pl-2">
      {childRows.map((child) => (
        <li key={child.id}>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-accent/50"
            onClick={onSelect}
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
    return <Film className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
  if (type === MOOC_ITEM_TYPE.DOC) {
    return <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  }
  return <ListTree className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function SelectedItemPanel({ moocId, item }: { moocId: number; item: MoocItem }) {
  const detail = useMoocItemQuery(moocId, item.id);
  const isVideo = (detail.data?.moocItemType ?? item.moocItemType) === MOOC_ITEM_TYPE.VIDEO;
  const objectName = detail.data?.objectName ?? item.objectName;
  const objectUrl = useObjectUrlQuery(isVideo ? (objectName ?? null) : null);

  return (
    <div className="space-y-3" data-testid="mooc-item-panel">
      <h2 className="text-lg font-semibold">{detail.data?.title ?? item.title ?? "未命名条目"}</h2>
      {isVideo ? (
        objectUrl.isPending ? (
          <Skeleton className="aspect-video w-full rounded-lg" />
        ) : objectUrl.isError || !objectUrl.data?.url ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
            视频地址获取失败，请稍后重试。
          </p>
        ) : (
          <VideoPlayer url={objectUrl.data.url} title={item.title ?? undefined} />
        )
      ) : detail.isPending ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : detail.data?.moocItemText?.content ? (
        <div className="rounded-xl border bg-card p-4">
          <TiptapEditor preset="readonly" value={detail.data.moocItemText.content} />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          这个条目还没有内容。
        </p>
      )}
    </div>
  );
}
