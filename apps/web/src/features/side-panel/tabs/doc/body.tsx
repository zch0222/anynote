"use client";

import { DocumentSkeleton } from "@/components/loading/skeletons";
import { DocIndexBadge } from "@/features/ai/components/doc-index-badge";
import { PdfViewer } from "@/features/ai/components/pdf/pdf-viewer";
import { useDocQuery } from "@/features/ai/use-docs";
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
 * 资料正文：PDF 预览，页码随导航版本跳转。
 *
 * @param props 标签记录、导航与端
 * @author 称霸幼儿园
 */
export function DocTabBody({ record, navigation, variant }: TabBodyProps) {
  const router = useRouter();
  const ref = record.family === "resource" && record.ref.type === "doc" ? record.ref : null;
  const doc = useDocQuery(ref?.id ?? 0);
  const base = useKnowledgeBaseQuery(ref?.kbId ?? 0);
  const href = tabHref(record, navigation.locator, variant);
  const title = doc.data?.docName?.trim() || RESOURCE_TYPE_LABEL.doc;
  const meta = resourceMeta(base.data?.knowledgeBaseName, RESOURCE_TYPE_LABEL.doc);

  if (!ref) return <ResourceUnavailable />;
  if (doc.isError) {
    return isResourceUnavailable(doc.error) ? (
      <ResourceUnavailable />
    ) : (
      <div className="p-4">
        <ResourceError onRetry={() => void doc.refetch()} retrying={doc.isFetching} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {variant === "desktop" ? (
        <TabHeader
          title={title}
          meta={meta}
          status={doc.data ? <DocIndexBadge status={doc.data.indexStatus} /> : null}
          href={href}
          {...(href ? { onOpenFullPage: () => router.push(href) } : {})}
        />
      ) : null}
      <div className="min-h-0 flex-1">
        {doc.isPending ? (
          <div className="p-4">
            <DocumentSkeleton />
          </div>
        ) : doc.data?.url ? (
          <PdfViewer
            url={doc.data.url}
            page={navigation.locator.page}
            navigationKey={navigation.revision}
          />
        ) : (
          <div className="p-4">
            <ResourceError onRetry={() => void doc.refetch()} retrying={doc.isFetching} />
          </div>
        )}
      </div>
    </div>
  );
}
