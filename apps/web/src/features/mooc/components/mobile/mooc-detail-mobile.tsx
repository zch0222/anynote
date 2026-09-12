"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VideoPlayer } from "@/features/mooc/components/video-player";
import { MOOC_ITEM_TYPE, type MoocItem, moocItemTypeName } from "@/features/mooc/schemas";
import { useMoocItemQuery, useMoocItemsQuery, useObjectUrlQuery } from "@/features/mooc/use-moocs";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, FileText, Film, ListTree } from "lucide-react";
import { useState } from "react";

/**
 * `/m/mooc/[id]`：课程详情。
 *
 * 桌面是 `lg:grid-cols-[20rem_1fr]` 的目录 + 内容双栏；手机上换成 Tabs——
 * 目录与内容各占一屏，选中条目后自动切到"内容"，省一次手动切换。
 */
export function MobileMoocDetail({ moocId }: { moocId: number }) {
  const [selected, setSelected] = useState<MoocItem | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [tab, setTab] = useState("catalog");
  const items = useMoocItemsQuery(moocId, 0);

  const selectItem = (item: MoocItem) => {
    setSelected(item);
    if (item.moocItemType === MOOC_ITEM_TYPE.CHAPTER) {
      setExpandedId((current) => (current === item.id ? null : item.id));
      return;
    }
    setTab("content");
  };

  return (
    <MobileScreen title={selected?.title ?? "课程"} back="/m/mooc">
      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as string)}
        className="p-4"
        data-testid="mobile-mooc-detail"
      >
        <TabsList className="w-full">
          <TabsTrigger value="catalog" className="flex-1">
            目录
          </TabsTrigger>
          <TabsTrigger value="content" className="flex-1">
            内容
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="pt-3">
          {items.isPending ? (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : items.isError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              条目加载失败：{items.error.message}
            </p>
          ) : items.data.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <ListTree className="size-4" aria-hidden="true" />
              这门课还没有章节内容
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {items.data.map((item) => (
                <MoocItemRow
                  key={item.id}
                  moocId={moocId}
                  item={item}
                  selected={selected?.id === item.id}
                  expanded={expandedId === item.id}
                  onSelect={selectItem}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="content" className="pt-3">
          {selected ? (
            <MoocItemPanel moocId={moocId} item={selected} />
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              先从"目录"里选一个章节、视频或文档。
            </p>
          )}
        </TabsContent>
      </Tabs>
    </MobileScreen>
  );
}

function MoocItemRow({
  moocId,
  item,
  selected,
  expanded,
  onSelect,
}: {
  moocId: number;
  item: MoocItem;
  selected: boolean;
  expanded: boolean;
  onSelect: (item: MoocItem) => void;
}) {
  const isChapter = item.moocItemType === MOOC_ITEM_TYPE.CHAPTER;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        aria-expanded={isChapter ? expanded : undefined}
        data-testid={`mooc-item-${item.id}`}
        className={cn(
          "flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm outline-none transition-colors",
          selected && "bg-accent text-accent-foreground",
        )}
      >
        <ItemIcon type={item.moocItemType} />
        <span className="min-w-0 flex-1 truncate">{item.title ?? "未命名条目"}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
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
  onSelect: (item: MoocItem) => void;
}) {
  const children = useMoocItemsQuery(moocId, parentId);
  if (children.isPending) {
    return <Skeleton className="mx-4 mb-2 h-10 rounded-lg" />;
  }
  const rows = children.data ?? [];
  if (rows.length === 0) {
    return <p className="px-10 py-2 text-xs text-muted-foreground">章节下暂无内容</p>;
  }
  return (
    <ul className="border-t bg-muted/30">
      {rows.map((child) => (
        <li key={child.id}>
          <button
            type="button"
            onClick={() => onSelect(child)}
            data-testid={`mooc-item-${child.id}`}
            className="flex min-h-12 w-full items-center gap-2 pl-10 pr-4 text-left text-sm outline-none"
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

/** 视频 / 文档内容面板。播放地址是临时签名 URL，由 `useObjectUrlQuery` 现取现用。 */
function MoocItemPanel({ moocId, item }: { moocId: number; item: MoocItem }) {
  const detail = useMoocItemQuery(moocId, item.id);
  const isVideo = (detail.data?.moocItemType ?? item.moocItemType) === MOOC_ITEM_TYPE.VIDEO;
  const objectName = detail.data?.objectName ?? item.objectName;
  const objectUrl = useObjectUrlQuery(isVideo ? (objectName ?? null) : null);

  return (
    <div className="space-y-3" data-testid="mooc-item-panel">
      <h2 className="text-base font-semibold">
        {detail.data?.title ?? item.title ?? "未命名条目"}
      </h2>
      {isVideo ? (
        objectUrl.isPending ? (
          <Skeleton className="aspect-video w-full rounded-lg" />
        ) : objectUrl.isError || !objectUrl.data?.url ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            视频地址获取失败，请稍后重试。
          </p>
        ) : (
          <VideoPlayer url={objectUrl.data.url} title={item.title ?? undefined} />
        )
      ) : detail.isPending ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : detail.data?.moocItemText?.content ? (
        <div className="rounded-xl border bg-card p-3">
          <TiptapEditor preset="readonly" value={detail.data.moocItemText.content} />
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          这个条目还没有内容。
        </p>
      )}
    </div>
  );
}
