"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { Sparkles } from "lucide-react";
import { memo } from "react";
import type { StreamMessage } from "../use-chat-stream";

/**
 * 单条消息：用户消息纯文本气泡；AI 输出完成后用只读编辑器渲染 Markdown
 * （代码 / 公式 / 表格）。流式进行中用轻量纯文本 + 光标展示——半截 Markdown
 * 逐 chunk 重建 ProseMirror 文档开销大且渲染抖动，完成后再切编辑器。
 */
export const MessageItem = memo(function MessageItem({ message }: { message: StreamMessage }) {
  if (message.role === 0) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Sparkles className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {message.content ? null : (
          <p className="text-sm text-muted-foreground" data-testid="assistant-thinking">
            思考中…
          </p>
        )}
        {message.streaming ? (
          <p
            className="text-sm whitespace-pre-wrap leading-relaxed"
            data-testid="assistant-streaming"
          >
            {message.content}
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary align-text-bottom" />
          </p>
        ) : message.content ? (
          <TiptapEditor preset="readonly" value={message.content} className="border-0" />
        ) : null}
      </div>
    </div>
  );
});
