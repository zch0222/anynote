"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoPlayer } from "@/features/mooc/components/video-player";
import { MOOC_ITEM_TYPE } from "@/features/mooc/schemas";
import { useMoocItemQuery, useObjectUrlQuery } from "@/features/mooc/use-moocs";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useRouter } from "next/navigation";
import { TabHeader } from "../../desktop/tab-header";
import { RESOURCE_TYPE_LABEL } from "../../resource-labels";
import type { TabBodyProps } from "../../types";
import {
  ResourceError,
  ResourceUnavailable,
  isResourceUnavailable,
  resourceMeta,
  tabHref,
} from "../shared";

/**
 * 慕课条目正文：视频播放或文档只读，秒数随导航版本原地跳转。
 *
 * @param props 标签记录、导航与端
 * @author 称霸幼儿园
 */
export function MoocItemTabBody({ record, navigation, variant }: TabBodyProps) {
  const router = useRouter();
  const ref = record.family === "resource" && record.ref.type === "mooc_item" ? record.ref : null;
  const detail = useMoocItemQuery(ref?.moocId ?? 0, ref?.id ?? 0);
  const base = useKnowledgeBaseQuery(ref?.kbId ?? 0);
  const isVideo = detail.data?.moocItemType === MOOC_ITEM_TYPE.VIDEO;
  const objectUrl = useObjectUrlQuery(isVideo ? detail.data?.objectName : null);
  const href = tabHref(record, navigation.locator, variant);
  const title = detail.data?.title?.trim() || RESOURCE_TYPE_LABEL.mooc_item;
  const meta = resourceMeta(base.data?.knowledgeBaseName, RESOURCE_TYPE_LABEL.mooc_item);

  if (!ref) return <ResourceUnavailable />;
  if (detail.isError) {
    return isResourceUnavailable(detail.error) ? (
      <ResourceUnavailable />
    ) : (
      <div className="p-4">
        <ResourceError onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {variant === "desktop" ? (
        <TabHeader
          title={title}
          meta={meta}
          href={href}
          {...(href ? { onOpenFullPage: () => router.push(href) } : {})}
        />
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {detail.isPending ? (
          isVideo ? (
            <Skeleton className="aspect-video w-full rounded-lg" />
          ) : (
            <Skeleton className="h-48 w-full rounded-lg" />
          )
        ) : isVideo ? (
          objectUrl.isPending ? (
            <Skeleton className="aspect-video w-full rounded-lg" />
          ) : objectUrl.isError || !objectUrl.data?.url ? (
            <ResourceError
              onRetry={() => void objectUrl.refetch()}
              retrying={objectUrl.isFetching}
            />
          ) : (
            <VideoPlayer
              url={objectUrl.data.url}
              title={detail.data?.title ?? undefined}
              startTime={navigation.locator.seconds ?? 0}
              navigationKey={navigation.revision}
            />
          )
        ) : detail.data?.moocItemText?.content ? (
          <div className="rounded-lg border bg-surface p-4">
            <TiptapEditor preset="readonly" value={detail.data.moocItemText.content} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-label-secondary">
            这个条目还没有内容。
          </p>
        )}
      </div>
    </div>
  );
}
