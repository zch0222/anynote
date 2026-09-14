"use client";

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { memo } from "react";
import type { StreamMessage } from "../use-chat-stream";
import { AiAvatar, StreamCaret, ThinkingDots } from "./stream-states";

/**
 * 单条消息。三态流转见 `stream-states.tsx` 的说明。
 *
 * 关键实现约束：AI 输出完成后才挂只读编辑器渲染 Markdown（代码 / 公式 / 表格）。
 * 流式过程中用纯文本 + 光标——半截 Markdown 逐 chunk 重建 ProseMirror 文档
 * 开销大且渲染抖动。
 */
export const MessageItem = memo(function MessageItem({ message }: { message: StreamMessage }) {
  if (message.role === 0) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-accent px-4 py-2.5 text-sm whitespace-pre-wrap text-accent-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  /*
   * 「思考中」的判据是**流式进行中且还没有内容**，而不是单看 content 为空：
   * 流结束但模型一个字都没返回时，应该走下面的"空回复"分支给出说明，
   * 而不是永远停在一个假装还在思考的动画上。
   */
  const thinking = Boolean(message.streaming) && message.content.length === 0;

  return (
    <div
      className="flex gap-3"
      data-state={thinking ? "thinking" : message.streaming ? "streaming" : "done"}
    >
      <AiAvatar thinking={thinking} />
      <div className="min-w-0 flex-1 space-y-1">
        {thinking ? (
          /*
           * `role="status"`（隐式 aria-live="polite"）让读屏播报「思考中」——
           * 视觉上的三点动画对读屏用户等于没有信息。
           */
          <output
            data-testid="assistant-thinking"
            className="flex items-center gap-2 rounded-lg bg-block px-3 py-2.5 text-sm text-label-secondary"
          >
            <span>思考中</span>
            <ThinkingDots className="ml-auto inline-flex items-center gap-1" />
          </output>
        ) : message.streaming ? (
          <p
            className="text-sm whitespace-pre-wrap leading-relaxed"
            data-testid="assistant-streaming"
            /* 逐字输出用 aria-live="polite"：整段重播会打断用户，只播新增部分 */
            aria-live="polite"
          >
            {message.content}
            <StreamCaret />
          </p>
        ) : message.content ? (
          <TiptapEditor preset="readonly" value={message.content} className="border-0" />
        ) : (
          // 流结束但内容为空：必须给一句解释，否则这一条看起来像渲染失败
          <p className="text-sm text-label-secondary" data-testid="assistant-empty">
            这次没有生成内容，可以换个说法再试。
          </p>
        )}
      </div>
    </div>
  );
});
