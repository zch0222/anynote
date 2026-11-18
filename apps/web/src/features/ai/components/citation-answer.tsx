"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Badge } from "@/components/ui/badge";
import { applyCitationReferences } from "@/lib/ai/citation-editor";
import {
  type Citation,
  type CitationVariant,
  citationHref,
  citationLabel,
} from "@/lib/ai/citations";
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
}: {
  content: string;
  citations: Citation[];
  variant: CitationVariant;
  onCitation?: ((citation: Citation) => boolean) | undefined;
  answerNotices?: readonly AnswerNotice[] | undefined;
}) {
  const router = useRouter();
  return (
    <div
      className="space-y-3"
      onClickCapture={(event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
          return;
        const target = event.target instanceof Element ? event.target.closest("a") : null;
        const href = target?.getAttribute("href");
        const citation = citations.find((item) => citationHref(item, variant) === href);
        if (!citation || !href) return;
        event.preventDefault();
        event.stopPropagation();
        if (!onCitation?.(citation)) router.push(href);
      }}
    >
      <TiptapEditor
        preset="aiAnswer"
        value={content}
        className="border-0"
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
                  className="space-y-1"
                  data-testid={`citation-${citation.index}`}
                >
                  {href ? (
                    <Link
                      href={href}
                      prefetch={false}
                      aria-label={`查看引用 ${citation.index}`}
                      className="break-words text-accent hover:underline"
                    >
                      {title}
                    </Link>
                  ) : (
                    <span>{title}</span>
                  )}
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
