"use client";

import { NEW_CONVERSATION_KEY, conversationKey } from "@/features/ai/query-keys";
import { useChatStreamStore } from "@/features/ai/use-chat-stream";
import { useConversationQuery } from "@/features/ai/use-conversations";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChatPanel } from "./chat-panel";
import { ConversationList } from "./conversation-list";

const CHAT_PATHNAME = "/ai/chat";

export type ChatPageProps = {
  /** 路由中的会话 id；不传表示新对话。 */
  conversationId?: number;
  initialBaseId?: number | undefined;
};

/**
 * AI 聊天页：左侧会话列表与右侧消息流。
 *
 * @param props 路由会话 id 与初始知识库 id
 * @author 称霸幼儿园
 */
export function ChatPage({ conversationId, initialBaseId }: ChatPageProps) {
  const pathname = usePathname();
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const previousPathname = useRef(pathname);
  if (previousPathname.current !== pathname) {
    previousPathname.current = pathname;
    if (!activeConversationId || pathname !== `${CHAT_PATHNAME}/${activeConversationId}`) {
      setActiveConversationId(conversationId);
    }
  }
  const newKey = initialBaseId ? `new:kb${initialBaseId}` : NEW_CONVERSATION_KEY;
  const sessionKey = activeConversationId ? conversationKey({ id: activeConversationId }) : newKey;
  const renameKey = useChatStreamStore((state) => state.renameKey);
  const detail = useConversationQuery(activeConversationId ?? 0);
  const hydrate = useChatStreamStore((state) => state.hydrate);

  // 打开已有会话：拉历史并灌入流式 store（幂等；流式中或已有内容不覆盖）
  useEffect(() => {
    if (detail.data && activeConversationId) {
      hydrate(
        `c${activeConversationId}`,
        detail.data.messages,
        detail.data.conversation?.id ?? activeConversationId,
        detail.data.conversation?.scope,
      );
    }
  }, [detail.data, activeConversationId, hydrate]);

  return (
    <div className="flex min-h-0 flex-1 bg-surface" data-testid="chat-page">
      <aside className="hidden w-72 shrink-0 border-r border-separator bg-sidebar md:block">
        <ConversationList activeId={activeConversationId ?? 0} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatPanel
          sessionKey={sessionKey}
          conversationTitle={
            activeConversationId ? (detail.data?.conversation?.title ?? "对话") : "新对话"
          }
          initialBaseId={initialBaseId}
          historyStatus={
            !activeConversationId || detail.data ? "ready" : detail.isError ? "error" : "pending"
          }
          onReloadHistory={() => void detail.refetch()}
          onConversationCreated={(createdId) => {
            if (!activeConversationId) {
              const nextPathname = `${CHAT_PATHNAME}/${createdId}`;
              flushSync(() => {
                renameKey(newKey, conversationKey({ id: createdId }));
                setActiveConversationId(createdId);
              });
              window.history.replaceState(window.history.state, "", nextPathname);
            }
          }}
          emptyHint={activeConversationId ? "继续这段对话" : "开始新的对话"}
        />
      </main>
    </div>
  );
}
