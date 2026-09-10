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
};

/**
 * AI 聊天页：左侧会话列表 + 右侧消息流。
 *
 * 新会话的消息流挂在固定 key（NEW_CONVERSATION_KEY）上，首条消息完成后
 * 从流式 chunk 拿到 conversationId：把会话迁移到正式 key 并回填路由，
 * 全程不重发请求、不丢消息。
 */
export function ChatPage({ conversationId }: ChatPageProps) {
  const router = useRouter();
  const sessionKey = conversationId
    ? conversationKey({ id: conversationId })
    : NEW_CONVERSATION_KEY;
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
      );
    }
  }, [detail.data, conversationId, hydrate]);

  return (
    <div className="flex h-[calc(100svh-9rem)] min-h-0" data-testid="chat-page">
      <aside className="hidden w-64 shrink-0 border-r md:block">
        <ConversationList activeId={conversationId ?? 0} />
      </aside>
      <main className="min-w-0 flex-1">
        <ChatPanel
          sessionKey={sessionKey}
          onConversationCreated={(createdId) => {
            if (!conversationId) {
              renameKey(NEW_CONVERSATION_KEY, `c${createdId}`);
              router.replace(`/ai/chat/${createdId}`);
            }
          }}
          emptyHint={conversationId ? "继续这段对话" : "开始新的对话"}
        />
      </main>
    </div>
  );
}
