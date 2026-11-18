"use client";

import { type Citation, type CitationVariant, parseCitations } from "@/lib/ai/citations";
import { memo } from "react";
import type { AnswerNotice } from "../schemas";
import type { StreamMessage } from "../use-chat-stream";
import { CitationAnswer } from "./citation-answer";
import { ProcessArea } from "./process/process-area";
import { AiAvatar, StreamCaret, ThinkingDots } from "./stream-states";

const ANSWER_NOTICE_TEXT: Record<AnswerNotice, string> = {
  UNSOURCED: "这条回答没有标注来源，内容可能不完全来自你的知识库",
  NOT_FROM_KNOWLEDGE: "这条回答不是来自你的知识库",
  CITATIONS_REMOVED: "部分无法核对的引用已移除",
};

/**
 * 显示用户消息、运行进度与带引用的助手回答。
 *
 * @author 称霸幼儿园
 */
export const MessageItem = memo(function MessageItem({
  message,
  variant = "desktop",
  onCitation,
}: {
  message: StreamMessage;
  variant?: CitationVariant;
  onCitation?: ((citation: Citation) => boolean) | undefined;
}) {
  if (message.role === 0) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-accent-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const thinking = Boolean(message.streaming) && message.content.length === 0;
  const citations = parseCitations(message.citations);

  return (
    <div
      className="flex gap-3"
      data-state={thinking ? "thinking" : message.streaming ? "streaming" : "done"}
    >
      <AiAvatar thinking={thinking} />
      <div className="min-w-0 flex-1 space-y-1">
        {message.process && message.process.items.length > 0 ? (
          <ProcessArea
            process={message.process}
            streaming={Boolean(message.streaming)}
            durationMs={message.durationMs === undefined ? undefined : message.durationMs}
            failed={message.outcome === "FAILED"}
            cancelled={message.outcome === "CANCELLED"}
          />
        ) : null}
        {message.processHiddenNotice ? (
          <p className="text-xs text-label-secondary" data-testid="process-hidden-notice">
            {message.processHiddenNotice}
          </p>
        ) : null}
        {thinking ? (
          <output
            data-testid="assistant-thinking"
            className="flex items-center gap-2 rounded-lg bg-block px-3 py-2.5 text-sm text-label-secondary"
          >
            <span>{message.progress ?? "正在准备"}</span>
            <ThinkingDots className="ml-auto inline-flex items-center gap-1" />
          </output>
        ) : message.streaming ? (
          <p
            className="text-sm whitespace-pre-wrap leading-relaxed"
            data-testid="assistant-streaming"
            aria-live="polite"
          >
            {message.content}
            <StreamCaret />
          </p>
        ) : message.content ? (
          <CitationAnswer
            content={message.content}
            citations={citations}
            variant={variant}
            onCitation={onCitation}
            answerNotices={message.answerNotices}
          />
        ) : message.outcome === "CANCELLED" ? (
          <p className="text-sm text-label-secondary">已取消</p>
        ) : (
          <p className="text-sm text-label-secondary" data-testid="assistant-empty">
            这次没有生成内容，可以换个说法再试。
          </p>
        )}
        {!message.streaming && message.answerNotices?.length ? (
          <div className="space-y-1" data-testid="answer-notices">
            {message.answerNotices.map((notice) => (
              <p key={notice} className="text-xs text-label-secondary">
                {ANSWER_NOTICE_TEXT[notice]}
              </p>
            ))}
          </div>
        ) : null}
        {message.streaming && message.content ? (
          <output className="block text-xs text-label-secondary">
            {message.progress ?? "正在生成回答"}
          </output>
        ) : null}
        {!message.streaming && message.content && message.outcome === "CANCELLED" ? (
          <p className="text-xs text-label-secondary">已取消</p>
        ) : null}
      </div>
    </div>
  );
});
