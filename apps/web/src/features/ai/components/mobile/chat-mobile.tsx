"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { ChatPanel } from "@/features/ai/components/chat-panel";
import { NEW_CONVERSATION_KEY, conversationKey } from "@/features/ai/query-keys";
import { useChatStreamStore } from "@/features/ai/use-chat-stream";
import { useConversationQuery } from "@/features/ai/use-conversations";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export type MobileChatProps = {
  /** 路由中的会话 id；不传表示新对话（`/m/ai/chat/new`）。 */
  conversationId?: number;
};

/**
 * `/m/ai/chat/[id]`：全屏对话。
 *
 * 消息流与输入区直接复用桌面的 `ChatPanel`——它本来就是"占满高度 + 贴底输入"的结构，
 * 手机上不需要第二份实现。流式状态在进程级 store 里，返回列表再进来不丢消息。
 *
 * 新会话的 key 迁移与路由回填也与桌面一致：首条消息完成后从流式 chunk 拿到
 * conversationId，把会话迁到正式 key 并 replace 路由，全程不重发请求。
 */
export function MobileChat({ conversationId }: MobileChatProps) {
  const router = useRouter();
  const sessionKey = conversationId
    ? conversationKey({ id: conversationId })
    : NEW_CONVERSATION_KEY;
  const renameKey = useChatStreamStore((state) => state.renameKey);
  const hydrate = useChatStreamStore((state) => state.hydrate);
  const detail = useConversationQuery(conversationId ?? 0);

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

  const title = conversationId ? (detail.data?.conversation?.title ?? "对话") : "新对话";

  return (
    <MobileScreen title={title} back="/m/ai/chat" fill contentClassName="min-h-0">
      <div className="min-h-0 flex-1" data-testid="mobile-chat">
        <ChatPanel
          sessionKey={sessionKey}
          onConversationCreated={(createdId) => {
            if (!conversationId) {
              renameKey(NEW_CONVERSATION_KEY, `c${createdId}`);
              router.replace(`/m/ai/chat/${createdId}`);
            }
          }}
          emptyHint={conversationId ? "继续这段对话" : "开始新的对话"}
        />
      </div>
    </MobileScreen>
  );
}
