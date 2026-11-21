"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ArrowUp, Square } from "lucide-react";
import { type FormEvent, type KeyboardEvent, type ReactNode, useRef, useState } from "react";

export type ChatInputProps = {
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string | undefined;
  onSend: (prompt: string) => void;
  onStop: () => void;
  /** 对话页使用独立卡片布局，文档问答保留原布局。 */
  presentation?: "document" | "conversation";
  /** 对话输入卡片底部的检索范围等控件。 */
  controls?: ReactNode;
};

/**
 * 对话输入区：Enter 发送、Shift+Enter 换行，流式中可停止。
 *
 * @param props 输入状态、发送/停止回调与布局属性
 * @author 称霸幼儿园
 */
export function ChatInput({
  streaming,
  disabled,
  placeholder,
  onSend,
  onStop,
  presentation = "document",
  controls,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const composingRef = useRef(false);
  const conversation = presentation === "conversation";

  const submit = () => {
    const prompt = value.trim();
    if (!prompt || streaming || disabled) {
      return;
    }
    onSend(prompt);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    if (composingRef.current || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    submit();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const input = (
    <Textarea
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={() => {
        composingRef.current = false;
      }}
      placeholder={placeholder ?? "输入消息，Enter 发送，Shift+Enter 换行"}
      rows={1}
      disabled={disabled}
      className={cn(
        conversation
          ? "max-h-56 min-h-12 resize-none border-0 bg-transparent px-2 py-2 text-base leading-6 shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
          : "max-h-40 min-h-10 resize-none border-0 shadow-none focus-visible:ring-0 dark:bg-transparent",
      )}
      data-testid="chat-input"
    />
  );

  const action = streaming ? (
    <Button
      type="button"
      size="icon"
      variant="secondary"
      onClick={onStop}
      aria-label="停止生成"
      data-testid="chat-stop"
    >
      <Square className="size-4" aria-hidden="true" />
    </Button>
  ) : (
    <Button
      type="submit"
      size="icon"
      disabled={disabled || value.trim().length === 0}
      aria-label="发送"
      data-testid="chat-send"
    >
      <ArrowUp className="size-4" aria-hidden="true" />
    </Button>
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        conversation
          ? "flex flex-col gap-1 rounded-2xl border border-separator bg-surface p-2 shadow-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
          : "flex items-end gap-2 rounded-xl border bg-surface p-2 shadow-sm",
      )}
    >
      {conversation ? (
        <>
          {input}
          <div className="flex min-w-0 items-center gap-2">
            {controls ? <div className="min-w-0 flex-1">{controls}</div> : null}
            <div className="ml-auto shrink-0">{action}</div>
          </div>
        </>
      ) : (
        <>
          {input}
          {action}
        </>
      )}
    </form>
  );
}
