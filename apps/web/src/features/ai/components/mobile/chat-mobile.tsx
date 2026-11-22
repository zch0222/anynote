"use client";

import { MobileScreen } from "@/components/layout/mobile/mobile-screen";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/features/ai/components/chat-panel";
import { NEW_CONVERSATION_KEY, conversationKey } from "@/features/ai/query-keys";
import { useChatStreamStore } from "@/features/ai/use-chat-stream";
import { useConversationQuery } from "@/features/ai/use-conversations";
import { SidePanelProvider, useSidePanelShell } from "@/features/side-panel/launcher";
import { SidePanelMobileHost } from "@/features/side-panel/mobile-launcher";
import { renameSidePanelSurface } from "@/features/side-panel/surface-events";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const MOBILE_CHAT_PATHNAME = "/m/ai/chat";

export type MobileChatProps = {
  /** 路由中的会话 id；不传表示新对话（`/m/ai/chat/new`）。 */
  conversationId?: number;
  initialBaseId?: number | undefined;
};

/**
 * `/m/ai/chat/[id]`：全屏对话。
 *
 * 消息流与输入区直接复用桌面的 `ChatPanel`——它本来就是"占满高度 + 贴底输入"的结构，
 * 手机上不需要第二份实现。流式状态在进程级 store 里，返回列表再进来不丢消息。
 *
 * 新会话的 key 迁移与地址栏回填也与桌面一致：首条消息拿到 conversationId 后，
 * 把会话迁到正式 key 并 replaceState 地址，不触发 RSC 导航或重发请求。
 *
 * @author 称霸幼儿园
 */
export function MobileChat({ conversationId, initialBaseId }: MobileChatProps) {
  const pathname = usePathname();
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const previousPathname = useRef(pathname);
  if (previousPathname.current !== pathname) {
    previousPathname.current = pathname;
    if (!activeConversationId || pathname !== `${MOBILE_CHAT_PATHNAME}/${activeConversationId}`) {
      setActiveConversationId(conversationId);
    }
  }
  const newKey = initialBaseId ? `new:kb${initialBaseId}` : NEW_CONVERSATION_KEY;
  const sessionKey = activeConversationId ? conversationKey({ id: activeConversationId }) : newKey;
  const renameKey = useChatStreamStore((state) => state.renameKey);
  const hydrate = useChatStreamStore((state) => state.hydrate);
  const detail = useConversationQuery(activeConversationId ?? 0);

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

  const title = activeConversationId ? (detail.data?.conversation?.title ?? "对话") : "新对话";

  const onConversationCreated = (createdId: number) => {
    if (activeConversationId) return;
    const nextPathname = `${MOBILE_CHAT_PATHNAME}/${createdId}`;
    flushSync(() => {
      renameKey(newKey, conversationKey({ id: createdId }));
      renameSidePanelSurface(`chat:${newKey}`, `chat:${conversationKey({ id: createdId })}`);
      setActiveConversationId(createdId);
    });
    window.history.replaceState(window.history.state, "", nextPathname);
  };

  return (
    <SidePanelProvider>
      <MobileChatScreen
        title={title}
        sessionKey={sessionKey}
        initialBaseId={initialBaseId}
        activeConversationId={activeConversationId}
        detailReady={!activeConversationId || Boolean(detail.data)}
        historyError={Boolean(activeConversationId && detail.isError)}
        onReloadHistory={() => void detail.refetch()}
        onConversationCreated={onConversationCreated}
      />
    </SidePanelProvider>
  );
}

function MobileChatScreen({
  title,
  sessionKey,
  initialBaseId,
  activeConversationId,
  detailReady,
  historyError,
  onReloadHistory,
  onConversationCreated,
}: {
  title: string;
  sessionKey: string;
  initialBaseId: number | undefined;
  activeConversationId: number | undefined;
  detailReady: boolean;
  historyError: boolean;
  onReloadHistory: () => void;
  onConversationCreated: (conversationId: number) => void;
}) {
  const shell = useSidePanelShell();
  const [tabCount, setTabCount] = useState(0);
  const showOpened = shell !== null && tabCount > 0 && !shell.panelOpen;

  return (
    <>
      <MobileScreen
        title={title}
        back="/m/ai/chat"
        fill
        tone="paper"
        contentClassName="min-h-0"
        actions={
          showOpened ? (
            <Button variant="ghost" size="sm" onClick={() => shell.open(null)}>
              已打开的内容（{tabCount}）
            </Button>
          ) : undefined
        }
      >
        <div className="flex min-h-0 flex-1 flex-col" data-testid="mobile-chat">
          <ChatPanel
            sessionKey={sessionKey}
            initialBaseId={initialBaseId}
            historyStatus={
              !activeConversationId || detailReady ? "ready" : historyError ? "error" : "pending"
            }
            onReloadHistory={onReloadHistory}
            variant="mobile"
            onConversationCreated={onConversationCreated}
            emptyHint={activeConversationId ? "继续这段对话" : "开始新的对话"}
          />
        </div>
      </MobileScreen>
      {shell?.mounted ? (
        <SidePanelMobileHost
          surface={`chat:${sessionKey}`}
          pending={shell.pending}
          panelOpen={shell.panelOpen}
          onPanelOpenChange={shell.setPanelOpen}
          onTabCountChange={setTabCount}
        />
      ) : null}
    </>
  );
}
