"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Badge } from "@/components/ui/badge";
import { shouldHandleSidePanelClick, useSidePanelLink } from "@/features/side-panel/link-context";
import { applyCitationReferences } from "@/lib/ai/citation-editor";
import {
  type Citation,
  type CitationVariant,
  citationHref,
  citationLabel,
} from "@/lib/ai/citations";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnswerNotice } from "../schemas";

/**
 * 回答正文与引用来源列表。
 *
 * @author 称霸幼儿园
 */
export function CitationAnswer({
  content,
  citations,
  variant,
  onCitation,
  answerNotices,
  presentation = "document",
}: {
  content: string;
  citations: Citation[];
  variant: CitationVariant;
  onCitation?: ((citation: Citation) => boolean) | undefined;
  answerNotices?: readonly AnswerNotice[] | undefined;
  presentation?: "document" | "conversation";
}) {
  const router = useRouter();
  const open = useSidePanelLink();
  return (
    <div
      className="space-y-3"
      onClickCapture={(event) => {
        if (!shouldHandleSidePanelClick(event)) return;
        const anchor = event.target instanceof Element ? event.target.closest("a") : null;
        if (!anchor || anchor.hasAttribute("data-side-panel-new-window")) return;
        const href = anchor.getAttribute("href");
        const citation = citations.find((item) => citationHref(item, variant) === href);
        if (!citation || !href) return;
        event.preventDefault();
        event.stopPropagation();
        if (onCitation?.(citation)) return;
        if (open) {
          open({ kind: "citation", citation }, { focus: event.detail === 0 });
          return;
        }
        router.push(href);
      }}
    >
      <TiptapEditor
        preset="aiAnswer"
        value={content}
        className={cn("border-0", presentation === "conversation" && "[&_.ProseMirror]:min-h-0!")}
        onReady={(editor) =>
          applyCitationReferences(
            editor,
            citations,
            variant,
            Boolean(answerNotices?.includes("CITATIONS_REMOVED")),
          )
        }
      />
      {citations.length > 0 ? (
        <div className="rounded-lg border bg-block p-3" data-testid="citation-list">
          <p className="mb-2 text-sm font-medium">引用来源</p>
          <ol className="space-y-3 text-sm">
            {citations.map((citation) => {
              const href = citationHref(citation, variant);
              const title = `[${citation.index}] ${citation.title || "未命名来源"}`;
              const location = citationLabel(citation);
              return (
                <li
                  key={citation.index}
                  className="group/item space-y-1"
                  data-testid={`citation-${citation.index}`}
                >
                  <div className="flex items-start gap-1">
                    {href ? (
                      <Link
                        href={href}
                        prefetch={false}
                        aria-label={`查看引用 ${citation.index}`}
                        className="min-w-0 break-words text-accent hover:underline"
                      >
                        {title}
                      </Link>
                    ) : (
                      <span className="min-w-0">{title}</span>
                    )}
                    {open && href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-side-panel-new-window
                        aria-label={`在新窗口打开「${citation.title || "未命名来源"}」`}
                        title={`在新窗口打开「${citation.title || "未命名来源"}」`}
                        className="mt-0.5 shrink-0 rounded-sm p-0.5 text-label-tertiary opacity-0 transition-opacity outline-none hover:text-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/item:opacity-100 [@media(pointer:coarse)]:opacity-100"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                  {citation.kbName || location ? (
                    <p className="text-xs text-label-secondary">
                      {[citation.kbName, location].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    {citation.authority === "generated" ? (
                      <Badge variant="warning">模型生成</Badge>
                    ) : null}
                    {citation.authority === "transcript" ? (
                      <Badge variant="secondary">转写内容</Badge>
                    ) : null}
                    {citation.stale ? <Badge variant="warning">索引滞后</Badge> : null}
                  </div>
                  {citation.snippet ? (
                    <blockquote className="border-l-2 pl-2 text-xs whitespace-pre-wrap text-label-secondary">
                      {citation.snippet}
                    </blockquote>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
