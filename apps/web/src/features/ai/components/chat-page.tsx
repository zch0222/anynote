"use client";

import { NEW_CONVERSATION_KEY, conversationKey } from "@/features/ai/query-keys";
import { useChatStreamStore } from "@/features/ai/use-chat-stream";
import { useConversationQuery } from "@/features/ai/use-conversations";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ChatPanel } from "./chat-panel";
import { ConversationList } from "./conversation-list";

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
  const router = useRouter();
  const newKey = initialBaseId ? `new:kb${initialBaseId}` : NEW_CONVERSATION_KEY;
  const sessionKey = conversationId ? conversationKey({ id: conversationId }) : newKey;
  const renameKey = useChatStreamStore((state) => state.renameKey);
  const detail = useConversationQuery(conversationId ?? 0);
  const hydrate = useChatStreamStore((state) => state.hydrate);

  // 打开已有会话：拉历史并灌入流式 store（幂等；流式中或已有内容不覆盖）
  useEffect(() => {
    if (detail.data && conversationId) {
      hydrate(
        `c${conversationId}`,
        detail.data.messages,
        detail.data.conversation?.id ?? conversationId,
        detail.data.conversation?.scope,
      );
    }
  }, [detail.data, conversationId, hydrate]);

  return (
    <div className="flex min-h-0 flex-1 bg-surface" data-testid="chat-page">
      <aside className="hidden w-72 shrink-0 border-r border-separator bg-sidebar md:block">
        <ConversationList activeId={conversationId ?? 0} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatPanel
          sessionKey={sessionKey}
          conversationTitle={
            conversationId ? (detail.data?.conversation?.title ?? "对话") : "新对话"
          }
          initialBaseId={initialBaseId}
          historyStatus={
            !conversationId || detail.data ? "ready" : detail.isError ? "error" : "pending"
          }
          onReloadHistory={() => void detail.refetch()}
          onConversationCreated={(createdId) => {
            if (!conversationId) {
              renameKey(newKey, `c${createdId}`);
              router.replace(`/ai/chat/${createdId}`);
            }
          }}
          emptyHint={conversationId ? "继续这段对话" : "开始新的对话"}
        />
      </main>
    </div>
  );
}
