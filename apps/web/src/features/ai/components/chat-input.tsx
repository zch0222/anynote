"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";

export type ChatInputProps = {
  streaming: boolean;
  disabled?: boolean;
  placeholder?: string | undefined;
  onSend: (prompt: string) => void;
  onStop: () => void;
};

/** 对话输入区：Enter 发送（IME 组合中除外）、Shift+Enter 换行、流式中可停止。 */
export function ChatInput({ streaming, disabled, placeholder, onSend, onStop }: ChatInputProps) {
  const [value, setValue] = useState("");
  const composingRef = useRef(false);

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
    // 中文输入法选词的 Enter 不应发送
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

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm"
    >
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
        className="max-h-40 min-h-10 resize-none border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        data-testid="chat-input"
      />
      {streaming ? (
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
      )}
    </form>
  );
}
