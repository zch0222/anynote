"use client";

import { Button } from "@/components/ui/button";
import { aiQueryKeys } from "@/features/ai/query-keys";
import { type SendArgs, useChatSession, useChatStreamStore } from "@/features/ai/use-chat-stream";
import { useSidePanelLink } from "@/features/side-panel/link-context";
import type { Citation, CitationVariant } from "@/lib/ai/citations";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, RotateCcw, Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { scopeDocId } from "../schemas";
import { ChatInput } from "./chat-input";
import { MessageItem } from "./message-item";

// 只在会话布局渲染；懒加载避免 Select 弹层进入文档问答的首屏共享包。
const ChatScopeSelect = dynamic(
  () => import("./chat-scope-select").then((mod) => mod.ChatScopeSelect),
  { ssr: false, loading: () => <div className="h-8" aria-hidden="true" /> },
);

export type ChatPanelProps = {
  /** 会话在流式 store 中的 key。 */
  sessionKey: string;
  /** 传入时走文档 RAG（Chat PDF）。 */
  docId?: number;
  initialBaseId?: number | undefined;
  historyStatus?: "pending" | "error" | "ready";
  onReloadHistory?: (() => void) | undefined;
  variant?: CitationVariant;
  onCitation?: ((citation: Citation) => boolean) | undefined;
  /** 流结束后刷新会话列表等外部数据。 */
  onSettled?: () => void;
  /** 新会话拿到 conversationId 时回调。 */
  onConversationCreated?: (conversationId: number) => void;
  placeholder?: string | undefined;
  emptyHint?: string | undefined;
  /** 桌面对话页头显示的会话标题。 */
  conversationTitle?: string;
  /** 桌面对话页头右侧的动作区（右侧栏展开按钮等）。 */
  headerActions?: ReactNode;
};

/**
 * AI 消息流与输入区，支持独立对话和文档问答两种布局。
 *
 * @param props 会话状态来源、历史状态、引用与布局属性
 * @author 称霸幼儿园
 */
export function ChatPanel({
  sessionKey,
  docId: requestedDocId,
  initialBaseId,
  historyStatus = "ready",
  onReloadHistory,
  variant = "desktop",
  onCitation,
  onSettled,
  onConversationCreated,
  placeholder,
  emptyHint,
  conversationTitle,
  headerActions,
}: ChatPanelProps) {
  const session = useChatSession(sessionKey);
  const docId = requestedDocId ?? scopeDocId(session.scope);
  const conversation = !docId;
  const send = useChatStreamStore((state) => state.send);
  const abort = useChatStreamStore((state) => state.abort);
  const setScope = useChatStreamStore((state) => state.setScope);
  const queryClient = useQueryClient();
  const sidePanelLink = useSidePanelLink();
  const sidePanelLinks = sidePanelLink ? { "data-side-panel-links": "" } : {};

  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollingToLatestRef = useRef(false);
  const [followingLatest, setFollowingLatest] = useState(true);

  useEffect(() => {
    if (!docId && !session.scope) {
      setScope(sessionKey, { knowledgeBaseIds: initialBaseId ? [initialBaseId] : [], refs: [] });
    }
  }, [docId, session.scope, initialBaseId, sessionKey, setScope]);

  useEffect(() => {
    if (sessionKey.length === 0) return;
    scrollingToLatestRef.current = false;
    setFollowingLatest(true);
  }, [sessionKey]);

  useEffect(() => {
    if (session.messages.length === 0 || !followingLatest || scrollingToLatestRef.current) {
      return;
    }
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [session.messages, followingLatest]);

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
      } else if (session.scope) {
        args.scope = session.scope;
      }
      if (conversationId > 0) {
        args.conversationId = conversationId;
      }
      scrollingToLatestRef.current = false;
      setFollowingLatest(true);
      void send(args);
    },
    [
      sessionKey,
      docId,
      session.conversationId,
      session.scope,
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

  const scrollToLatest = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    scrollingToLatestRef.current = true;
    setFollowingLatest(true);
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, []);

  const handleScroll = (element: HTMLDivElement) => {
    const nearLatest = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    if (scrollingToLatestRef.current) {
      if (!nearLatest) return;
      scrollingToLatestRef.current = false;
    }
    setFollowingLatest(nearLatest);
  };

  const streaming = session.status === "streaming";
  const lastMessage = session.messages[session.messages.length - 1];
  const canRetryLastAnswer = Boolean(
    conversation &&
      !streaming &&
      lastMessage?.role === 1 &&
      lastMessage.content &&
      lastMessage.outcome !== "FAILED" &&
      lastMessage.outcome !== "CANCELLED",
  );
  const historyUnavailable = session.messages.length === 0 && historyStatus !== "ready";
  const hero = conversation && session.messages.length === 0 && !historyUnavailable;
  const presentation = conversation ? "conversation" : "document";

  const messageContent = (
    <>
      {historyUnavailable ? (
        historyStatus === "pending" ? (
          <p className="text-sm text-label-secondary">加载中…</p>
        ) : (
          <div role="alert" className="space-y-2 text-sm text-danger">
            <p>服务暂时不可用，请稍后重试</p>
            <Button variant="outline" size="sm" onClick={onReloadHistory}>
              重试
            </Button>
          </div>
        )
      ) : null}
      {!historyUnavailable && session.messages.length === 0 ? (
        conversation ? (
          <div className="flex flex-col items-center text-center" data-testid="chat-empty">
            <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Sparkles className="size-6" aria-hidden="true" />
            </span>
            <h2 className="text-[1.625rem] leading-8 font-medium text-label">
              {emptyHint ?? "开始新的对话"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-label-secondary">
              AI 回复支持 Markdown：代码块、表格与公式。
            </p>
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-lg font-medium">{emptyHint ?? "开始新的对话"}</p>
            <p className="mt-2 text-sm text-label-secondary">就当前文档提问，回答基于文档内容。</p>
          </div>
        )
      ) : null}
      {session.messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          variant={variant}
          onCitation={onCitation}
          onRetry={
            canRetryLastAnswer && index === session.messages.length - 1 ? handleRetry : undefined
          }
          presentation={presentation}
        />
      ))}
      {session.status === "error" && session.error ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
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
    </>
  );

  const scopeControl = conversation ? (
    <ChatScopeSelect
      scope={session.scope ?? { knowledgeBaseIds: [], refs: [] }}
      disabled={streaming || historyUnavailable}
      onChange={(scope) => setScope(sessionKey, scope)}
    />
  ) : undefined;

  const composer = (
    <div
      className={cn(
        conversation
          ? "relative mx-auto w-full max-w-[50rem] shrink-0 px-4 pt-1 pb-3"
          : "mx-auto w-full max-w-3xl px-4 pb-4",
      )}
    >
      {conversation && !followingLatest && session.messages.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute -top-10 right-4 z-10 size-9 bg-surface shadow-card"
          aria-label="回到最新"
          title="回到最新"
          onClick={scrollToLatest}
        >
          <ArrowDown className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
      <ChatInput
        streaming={streaming}
        disabled={historyUnavailable}
        onSend={handleSend}
        onStop={() => {
          abort(sessionKey);
        }}
        placeholder={placeholder}
        presentation={presentation}
        controls={scopeControl}
      />
      <p className="mt-2 text-center text-xs text-label-secondary">内容由 AI 生成，请注意甄别</p>
    </div>
  );

  if (!conversation) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <p className="border-b px-4 py-2 text-sm text-label-secondary">检索范围：当前资料</p>
        <div
          ref={viewportRef}
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => handleScroll(event.currentTarget)}
        >
          <div
            className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6"
            data-testid="message-list"
            {...sidePanelLinks}
          >
            {messageContent}
          </div>
        </div>
        {composer}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {variant === "desktop" && conversationTitle ? (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-separator bg-surface px-6">
          <h1
            className="min-w-0 flex-1 truncate text-sm font-medium text-label"
            title={conversationTitle}
          >
            {conversationTitle}
          </h1>
          {headerActions}
        </header>
      ) : null}
      <div className={cn("flex min-h-0 flex-1 flex-col", hero && "justify-center")}>
        <div
          ref={viewportRef}
          className={cn(
            "overflow-y-auto overscroll-contain",
            hero ? "max-h-full" : "min-h-0 flex-1",
          )}
          onScroll={(event) => handleScroll(event.currentTarget)}
        >
          <div
            className={cn("mx-auto w-full max-w-3xl px-4", hero ? "py-2" : "space-y-6 py-6")}
            data-testid="message-list"
            {...sidePanelLinks}
          >
            {messageContent}
          </div>
        </div>
        {composer}
      </div>
    </div>
  );
}
