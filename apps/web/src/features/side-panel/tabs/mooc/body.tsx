"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { MOOC_ITEM_TYPE, type MoocItem, moocItemTypeName } from "@/features/mooc/schemas";
import { useMoocItemsQuery, useMoocQuery } from "@/features/mooc/use-moocs";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, FileText, Film, ListTree } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TabHeader } from "../../desktop/tab-header";
import { RESOURCE_TYPE_LABEL } from "../../resource-labels";
import type { TabBodyActions, TabBodyProps } from "../../types";
import {
  ResourceError,
  ResourceUnavailable,
  isResourceUnavailable,
  resourceMeta,
  tabHref,
} from "../shared";

/**
 * 慕课正文：课程信息与可展开目录，点可播放条目在侧栏打开。
 *
 * @param props 标签记录、导航与端
 * @author 称霸幼儿园
 */
export function MoocTabBody({ record, navigation, variant, actions }: TabBodyProps) {
  const router = useRouter();
  const ref = record.family === "resource" && record.ref.type === "mooc" ? record.ref : null;
  const mooc = useMoocQuery(ref?.id ?? 0);
  const items = useMoocItemsQuery(ref?.id ?? 0, 0);
  const href = tabHref(record, navigation.locator, variant);
  const title = mooc.data?.title?.trim() || RESOURCE_TYPE_LABEL.mooc;
  const kbName = mooc.data?.moocKnowledgeBaseName;

  if (!ref) return <ResourceUnavailable />;
  if (mooc.isError) {
    return isResourceUnavailable(mooc.error) ? (
      <ResourceUnavailable />
    ) : (
      <div className="p-4">
        <ResourceError onRetry={() => void mooc.refetch()} retrying={mooc.isFetching} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {variant === "desktop" ? (
        <TabHeader
          title={title}
          meta={resourceMeta(kbName, RESOURCE_TYPE_LABEL.mooc)}
          href={href}
          {...(href ? { onOpenFullPage: () => router.push(href) } : {})}
        />
      ) : null}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {mooc.data?.moocDescription?.trim() ? (
          <p className="line-clamp-3 text-sm text-label-secondary">{mooc.data.moocDescription}</p>
        ) : null}
        <section className="space-y-2">
          <h3 className="text-footnote font-semibold text-label">课程目录</h3>
          {items.isPending ? (
            <div className="space-y-2">
              {[0, 1, 2].map((item) => (
                <Skeleton key={item} className="h-9 rounded-md" />
              ))}
            </div>
          ) : items.isError ? (
            <ResourceError
              compact
              onRetry={() => void items.refetch()}
              retrying={items.isFetching}
            />
          ) : items.data.length === 0 ? (
            <p className="flex items-center gap-2 py-4 text-sm text-label-secondary">
              <ListTree className="size-4" aria-hidden="true" />
              这门课还没有章节内容
            </p>
          ) : (
            <ul className="space-y-1">
              {items.data.map((item) => (
                <CatalogItem
                  key={item.id}
                  item={item}
                  moocId={ref.id}
                  kbId={ref.kbId}
                  kbName={kbName}
                  depth={0}
                  actions={actions}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function CatalogItem({
  item,
  moocId,
  kbId,
  kbName,
  depth,
  actions,
}: {
  item: MoocItem;
  moocId: number;
  kbId: number;
  kbName: string | null | undefined;
  depth: number;
  actions: TabBodyActions;
}) {
  const [expanded, setExpanded] = useState(false);
  const isChapter = item.moocItemType === MOOC_ITEM_TYPE.CHAPTER;
  const children = useMoocItemsQuery(moocId, expanded && isChapter ? item.id : 0);
  const title = item.title?.trim() || "未命名条目";
  const hint =
    item.title || kbName
      ? { ...(item.title ? { title: item.title } : {}), ...(kbName ? { kbName } : {}) }
      : undefined;

  const open = () => {
    actions.openResource({
      ref: { type: "mooc_item", id: item.id, kbId, moocId },
      locator: {},
      ...(hint ? { hint } : {}),
    });
  };

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md text-sm transition-colors hover:bg-fill-hover",
          depth > 0 && "ml-4",
        )}
      >
        {isChapter ? (
          <button
            type="button"
            aria-label={expanded ? "收起章节" : "展开章节"}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="rounded-sm p-1 text-label-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          onClick={isChapter ? () => setExpanded((value) => !value) : open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid={`side-panel-mooc-item-${item.id}`}
        >
          <ItemIcon type={item.moocItemType} />
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <span className="shrink-0 text-xs text-label-tertiary">
            {moocItemTypeName(item.moocItemType)}
          </span>
        </button>
      </div>
      {isChapter && expanded ? (
        children.isPending ? (
          <Skeleton className="ml-8 h-8 w-40 rounded-md" />
        ) : children.isError ? (
          <p className="ml-8 py-1 text-xs text-danger">加载失败，请稍后重试</p>
        ) : children.data.length === 0 ? (
          <p className="ml-8 py-1 text-xs text-label-secondary">章节下暂无内容</p>
        ) : (
          <ul className="ml-4 space-y-1 border-l pl-2">
            {children.data.map((child) => (
              <CatalogItem
                key={child.id}
                item={child}
                moocId={moocId}
                kbId={kbId}
                kbName={kbName}
                depth={depth + 1}
                actions={actions}
              />
            ))}
          </ul>
        )
      ) : null}
    </li>
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
