"use client";

import { Button } from "@/components/ui/button";
import { DEFAULT_AI_MODEL, loadPreferredModel } from "@/features/ai/model-options";
import { NEW_CONVERSATION_KEY, aiQueryKeys } from "@/features/ai/query-keys";
import { type SendArgs, useChatSession, useChatStreamStore } from "@/features/ai/use-chat-stream";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatInput } from "./chat-input";
import { MessageItem } from "./message-item";

export type ChatPanelProps = {
  /** 会话在流式 store 中的 key。 */
  sessionKey: string;
  /** 传入时走文档 RAG（Chat PDF）。 */
  docId?: number;
  /** 流结束后刷新会话列表等外部数据。 */
  onSettled?: () => void;
  /** 新会话拿到 conversationId 时回调（聊天页据此迁移 key 并回填路由）。 */
  onConversationCreated?: (conversationId: number) => void;
  placeholder?: string | undefined;
  emptyHint?: string | undefined;
};

/** 右侧聊天面板：消息流 + 输入区。流式状态由全局 store 持有，切页不丢。 */
export function ChatPanel({
  sessionKey,
  docId,
  onSettled,
  onConversationCreated,
  placeholder,
  emptyHint,
}: ChatPanelProps) {
  const session = useChatSession(sessionKey);
  const send = useChatStreamStore((state) => state.send);
  const abort = useChatStreamStore((state) => state.abort);
  const queryClient = useQueryClient();
  const [model, setModel] = useState<string>(DEFAULT_AI_MODEL);

  useEffect(() => {
    setModel(loadPreferredModel());
  }, []);

  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // 用户向上翻阅时不强拉底部；重新贴近底部后恢复跟随
  useEffect(() => {
    if (session.messages.length === 0 || !stickToBottomRef.current) {
      return;
    }
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [session.messages]);

  const handleSend = useCallback(
    (prompt: string) => {
      const conversationId = session.conversationId ?? 0;
      const args: SendArgs = {
        key: sessionKey,
        prompt,
        onSettled: () => {
          if (!docId) {
            queryClient.invalidateQueries({ queryKey: aiQueryKeys.conversations });
          }
          onSettled?.();
        },
        ...(onConversationCreated ? { onConversationCreated } : {}),
      };
      if (docId) {
        args.docId = docId;
      }
      if (conversationId > 0) {
        args.conversationId = conversationId;
      }
      args.model = model;
      stickToBottomRef.current = true;
      void send(args);
    },
    [
      sessionKey,
      docId,
      session.conversationId,
      model,
      send,
      onConversationCreated,
      onSettled,
      queryClient,
    ],
  );

  const handleRetry = useCallback(() => {
    const lastUser = [...session.messages].reverse().find((message) => message.role === 0);
    if (lastUser) {
      handleSend(lastUser.content);
    }
  }, [session.messages, handleSend]);

  const streaming = session.status === "streaming";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={viewportRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const element = event.currentTarget;
          stickToBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}
      >
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6" data-testid="message-list">
          {session.messages.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-lg font-medium">{emptyHint ?? "开始新的对话"}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {docId
                  ? "就当前文档提问，回答基于文档内容。"
                  : "AI 回复支持 Markdown：代码块、表格与公式。"}
              </p>
            </div>
          ) : (
            session.messages.map((message) => <MessageItem key={message.id} message={message} />)
          )}
          {session.status === "error" && session.error ? (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              data-testid="chat-error"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{session.error}</span>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                重试
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <ChatInput
          streaming={streaming}
          onSend={handleSend}
          onStop={() => {
            abort(sessionKey);
          }}
          placeholder={placeholder}
        />
        <p className="mt-2 text-center text-xs text-muted-foreground">内容由 AI 生成，请注意甄别</p>
      </div>
    </div>
  );
}
