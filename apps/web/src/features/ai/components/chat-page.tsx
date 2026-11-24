"use client";

import { ListRowsSkeleton } from "@/components/loading/skeletons";
import { NEW_CONVERSATION_KEY, conversationKey } from "@/features/ai/query-keys";
import { useChatStreamStore } from "@/features/ai/use-chat-stream";
import { useConversationQuery } from "@/features/ai/use-conversations";
import {
  SidePanelExpandButton,
  SidePanelHost,
  SidePanelProvider,
  useSidePanelShell,
} from "@/features/side-panel/launcher";
import { renameSidePanelSurface } from "@/features/side-panel/surface-events";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChatPanel } from "./chat-panel";

const CHAT_PATHNAME = "/ai/chat";

// 桌面会话列表按需加载，避免重命名对话框与列表数据层进入对话首屏共享包。
const ConversationList = dynamic(
  () => import("./conversation-list").then((mod) => mod.ConversationList),
  {
    ssr: false,
    loading: () => (
      <div className="h-full overflow-hidden p-3">
        <ListRowsSkeleton count={4} />
      </div>
    ),
  },
);

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

  const onConversationCreated = (createdId: number) => {
    if (activeConversationId) return;
    const nextPathname = `${CHAT_PATHNAME}/${createdId}`;
    flushSync(() => {
      renameKey(newKey, conversationKey({ id: createdId }));
      renameSidePanelSurface(`chat:${newKey}`, `chat:${conversationKey({ id: createdId })}`);
      setActiveConversationId(createdId);
    });
    window.history.replaceState(window.history.state, "", nextPathname);
  };

  return (
    <SidePanelProvider>
      <ChatPageLayout
        activeConversationId={activeConversationId}
        sessionKey={sessionKey}
        initialBaseId={initialBaseId}
        conversationTitle={
          activeConversationId ? (detail.data?.conversation?.title ?? "对话") : "新对话"
        }
        historyStatus={
          !activeConversationId || detail.data ? "ready" : detail.isError ? "error" : "pending"
        }
        onReloadHistory={() => void detail.refetch()}
        onConversationCreated={onConversationCreated}
        emptyHint={activeConversationId ? "继续这段对话" : "开始新的对话"}
      />
    </SidePanelProvider>
  );
}

function ChatPageLayout({
  activeConversationId,
  sessionKey,
  initialBaseId,
  conversationTitle,
  historyStatus,
  onReloadHistory,
  onConversationCreated,
  emptyHint,
}: {
  activeConversationId: number | undefined;
  sessionKey: string;
  initialBaseId: number | undefined;
  conversationTitle: string;
  historyStatus: "pending" | "error" | "ready";
  onReloadHistory: () => void;
  onConversationCreated: (conversationId: number) => void;
  emptyHint: string;
}) {
  const shell = useSidePanelShell();
  const [listVisible, setListVisible] = useState(true);
  const surface = `chat:${sessionKey}`;

  return (
    <div className="relative flex min-h-0 flex-1 bg-surface" data-testid="chat-page">
      <aside
        className={cn(
          "w-72 shrink-0 border-r border-separator bg-sidebar",
          listVisible ? "hidden md:block" : "hidden",
        )}
      >
        <ConversationList activeId={activeConversationId ?? 0} surface={surface} />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatPanel
          sessionKey={sessionKey}
          conversationTitle={conversationTitle}
          initialBaseId={initialBaseId}
          historyStatus={historyStatus}
          onReloadHistory={onReloadHistory}
          onConversationCreated={onConversationCreated}
          headerActions={shell && !shell.panelOpen ? <SidePanelExpandButton /> : null}
          emptyHint={emptyHint}
        />
      </main>
      {shell?.mounted ? (
        <SidePanelHost
          surface={surface}
          pending={shell.pending}
          panelOpen={shell.panelOpen}
          onPanelOpenChange={shell.setPanelOpen}
          onListVisibleChange={setListVisible}
        />
      ) : null}
    </div>
  );
}
