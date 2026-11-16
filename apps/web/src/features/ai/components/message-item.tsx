"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { type Citation, type CitationVariant, parseCitations } from "@/lib/ai/citations";
import { memo } from "react";
import type { StreamMessage } from "../use-chat-stream";
import { CitationAnswer } from "./citation-answer";
import { AiAvatar, StreamCaret, ThinkingDots } from "./stream-states";

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
        ) : message.content && citations.length > 0 ? (
          <CitationAnswer
            content={message.content}
            citations={citations}
            variant={variant}
            onCitation={onCitation}
          />
        ) : message.content ? (
          <TiptapEditor preset="readonly" value={message.content} className="border-0" />
        ) : message.outcome === "CANCELLED" ? (
          <p className="text-sm text-label-secondary">已取消</p>
        ) : (
          <p className="text-sm text-label-secondary" data-testid="assistant-empty">
            这次没有生成内容，可以换个说法再试。
          </p>
        )}
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
