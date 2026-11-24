"use client";

import { type Citation, type CitationVariant, parseCitations } from "@/lib/ai/citations";
import { cn } from "@/lib/utils";
import { memo } from "react";
import type { AnswerNotice } from "../schemas";
import type { StreamMessage } from "../use-chat-stream";
import { CitationAnswer } from "./citation-answer";
import { MessageActions } from "./message-actions";
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
 * @param props 消息内容、引用回调与展示场景
 * @author 称霸幼儿园
 */
export const MessageItem = memo(function MessageItem({
  message,
  variant = "desktop",
  onCitation,
  onRetry,
  presentation = "document",
}: {
  message: StreamMessage;
  variant?: CitationVariant;
  onCitation?: ((citation: Citation) => boolean) | undefined;
  onRetry?: (() => void) | undefined;
  presentation?: "document" | "conversation";
}) {
  const conversation = presentation === "conversation";
  if (message.role === 0) {
    return (
      <div className="group/message flex flex-col items-end gap-1">
        <div
          className={cn(
            conversation
              ? "max-w-[82%] rounded-2xl border border-accent/15 bg-accent-soft px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-label"
              : "max-w-[85%] rounded-xl rounded-br-sm bg-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-accent-foreground",
          )}
        >
          {message.content}
        </div>
        {conversation && message.content ? (
          <MessageActions content={message.content} align="end" className="-mr-1" />
        ) : null}
      </div>
    );
  }

  const thinking = Boolean(message.streaming) && message.content.length === 0;
  const citations = parseCitations(message.citations);

  return (
    <div
      className={
        conversation
          ? "anynote-ai-message group/message min-w-0 rounded-2xl border border-separator/80 bg-surface p-4 shadow-sm sm:p-5"
          : "flex gap-3"
      }
      data-message-surface={conversation ? "conversation" : undefined}
      data-state={thinking ? "thinking" : message.streaming ? "streaming" : "done"}
    >
      {conversation ? null : <AiAvatar thinking={thinking} />}
      <div className={conversation ? "min-w-0 space-y-3" : "min-w-0 flex-1 space-y-1"}>
        {message.process && message.process.items.length > 0 ? (
          <ProcessArea
            process={message.process}
            streaming={Boolean(message.streaming)}
            durationMs={message.durationMs}
            toolCalls={message.toolCalls}
            firstOutputMs={message.firstOutputMs}
            failed={message.outcome === "FAILED"}
            cancelled={message.outcome === "CANCELLED"}
            variant={variant}
            presentation={presentation}
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
            className={cn(
              conversation
                ? "flex items-center gap-2 py-1 text-sm text-label-secondary"
                : "flex items-center gap-2 rounded-lg bg-block px-3 py-2.5 text-sm text-label-secondary",
            )}
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
            presentation={presentation}
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
        {conversation && !message.streaming && message.content ? (
          <MessageActions content={message.content} onRetry={onRetry} />
        ) : null}
      </div>
    </div>
  );
});
