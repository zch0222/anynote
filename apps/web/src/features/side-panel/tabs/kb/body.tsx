"use client";

import { ListRowsSkeleton, PanelSkeleton } from "@/components/loading/skeletons";
import { DocIndexBadge } from "@/features/ai/components/doc-index-badge";
import { useKnowledgeBaseDocsQuery } from "@/features/notes/use-docs";
import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { formatRelativeTime } from "@/lib/format-time";
import { useRouter } from "next/navigation";
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

/** 知识库正文里每类预览的条数。 */
export const KB_TAB_PREVIEW = 5;

/**
 * 知识库正文：名称、简介、最近笔记与资料各 5 条，点条目在侧栏打开。
 *
 * @param props 标签记录、导航、端与动作
 * @author 称霸幼儿园
 */
export function KbTabBody({ record, navigation, variant, actions }: TabBodyProps) {
  const router = useRouter();
  const ref = record.family === "resource" && record.ref.type === "kb" ? record.ref : null;
  const base = useKnowledgeBaseQuery(ref?.id ?? 0);
  const notes = useNotesQuery({
    knowledgeBaseId: ref?.id ?? 0,
    page: 1,
    pageSize: KB_TAB_PREVIEW,
  });
  const docs = useKnowledgeBaseDocsQuery(ref?.id ?? 0);
  const href = tabHref(record, navigation.locator, variant);
  const title = base.data?.knowledgeBaseName?.trim() || RESOURCE_TYPE_LABEL.kb;
  const kbName = base.data?.knowledgeBaseName;

  if (!ref) return <ResourceUnavailable />;
  if (base.isError) {
    return isResourceUnavailable(base.error) ? (
      <ResourceUnavailable />
    ) : (
      <div className="p-4">
        <ResourceError onRetry={() => void base.refetch()} retrying={base.isFetching} />
      </div>
    );
  }
  if (base.isPending) {
    return (
      <div className="p-4">
        <PanelSkeleton />
      </div>
    );
  }

  const noteRows = (notes.data?.rows ?? []).slice(0, KB_TAB_PREVIEW);
  const docRows = (docs.data?.rows ?? []).slice(0, KB_TAB_PREVIEW);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {variant === "desktop" ? (
        <TabHeader
          title={title}
          meta={resourceMeta(null, RESOURCE_TYPE_LABEL.kb)}
          href={href}
          {...(href ? { onOpenFullPage: () => router.push(href) } : {})}
        />
      ) : null}
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <header className="space-y-1.5">
          <h3 className="text-base font-semibold text-label">{title}</h3>
          <p className="line-clamp-3 text-sm text-label-secondary">
            {base.data?.detail?.trim() || "这个知识库还没有填写简介。"}
          </p>
        </header>

        <section className="space-y-2">
          <h4 className="text-footnote font-semibold text-label">最近笔记</h4>
          {notes.isPending ? (
            <ListRowsSkeleton count={KB_TAB_PREVIEW} />
          ) : notes.isError ? (
            <ResourceError
              compact
              onRetry={() => void notes.refetch()}
              retrying={notes.isFetching}
            />
          ) : noteRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-separator px-3 py-4 text-center text-xs text-label-secondary">
              这个知识库还没有笔记
            </p>
          ) : (
            <ul className="overflow-hidden rounded-md border border-separator">
              {noteRows.map((note) => (
                <li key={note.id} className="border-b border-separator last:border-b-0">
                  <button
                    type="button"
                    onClick={() =>
                      actions.openResource({
                        ref: { type: "note", id: note.id, kbId: ref.id },
                        locator: {},
                        ...(note.title || kbName
                          ? {
                              hint: {
                                ...(note.title ? { title: note.title } : {}),
                                ...(kbName ? { kbName } : {}),
                              },
                            }
                          : {}),
                      })
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    data-testid={`side-panel-kb-note-${note.id}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-label">
                      {note.title?.trim() || "未命名笔记"}
                    </span>
                    <span className="shrink-0 text-xs text-label-tertiary">
                      {formatRelativeTime(note.latestOperationTime ?? note.updateTime)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="text-footnote font-semibold text-label">资料</h4>
          {docs.isPending ? (
            <ListRowsSkeleton count={KB_TAB_PREVIEW} />
          ) : docs.isError ? (
            <ResourceError compact onRetry={() => void docs.refetch()} retrying={docs.isFetching} />
          ) : docRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-separator px-3 py-4 text-center text-xs text-label-secondary">
              这个知识库还没有资料
            </p>
          ) : (
            <ul className="overflow-hidden rounded-md border border-separator">
              {docRows.map((doc) => (
                <li key={doc.id} className="border-b border-separator last:border-b-0">
                  <button
                    type="button"
                    onClick={() =>
                      actions.openResource({
                        ref: { type: "doc", id: doc.id, kbId: ref.id },
                        locator: {},
                        ...(doc.docName || kbName
                          ? {
                              hint: {
                                ...(doc.docName ? { title: doc.docName } : {}),
                                ...(kbName ? { kbName } : {}),
                              },
                            }
                          : {}),
                      })
                    }
                    className="flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-colors hover:bg-fill-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    data-testid={`side-panel-kb-doc-${doc.id}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-label">
                      {doc.docName?.trim() || "未命名文档"}
                    </span>
                    <DocIndexBadge status={doc.indexStatus} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
