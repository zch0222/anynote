import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/ai/chat" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
}));

const conversationQuery = vi.hoisted(() => vi.fn());
vi.mock("@/features/ai/use-conversations", () => ({
  useConversationQuery: conversationQuery,
}));

const store = vi.hoisted(() => ({ renameKey: vi.fn(), hydrate: vi.fn() }));
vi.mock("@/features/ai/use-chat-stream", () => ({
  useChatStreamStore: (selector: (state: unknown) => unknown) => selector(store),
}));

vi.mock("../chat-panel", () => ({
  ChatPanel: ({
    sessionKey,
    onConversationCreated,
  }: {
    sessionKey: string;
    onConversationCreated?: (id: number) => void;
  }) => (
    <button
      type="button"
      data-testid="chat-panel"
      data-session-key={sessionKey}
      onClick={() => onConversationCreated?.(42)}
    >
      panel
    </button>
  ),
}));
vi.mock("../conversation-list", () => ({
  ConversationList: ({ activeId }: { activeId: number }) => (
    <div data-testid="conversation-list" data-active-id={activeId} />
  ),
}));

import { ChatPage } from "@/features/ai/components/chat-page";
import { renderWithProviders } from "@/test/render";

describe("ChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.pathname = "/ai/chat";
    conversationQuery.mockReturnValue({ data: undefined, isError: false, refetch: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** 页面占用外壳提供的剩余高度，不自行估算视口高度。 */
  it("使用 Flex 剩余高度而非固定视口减高", () => {
    renderWithProviders(<ChatPage />);

    const page = screen.getByTestId("chat-page");
    expect(page).toHaveClass("flex-1", "min-h-0");
    expect(page.className).not.toContain("100svh");
  });

  it("首条消息后同步切换会话并只回填地址栏，不发起路由导航", async () => {
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation((_state, _unused, url) => {
        navigation.pathname = String(url);
      });
    renderWithProviders(<ChatPage />);
    await screen.findByTestId("conversation-list");

    fireEvent.click(screen.getByTestId("chat-panel"));

    expect(store.renameKey).toHaveBeenCalledExactlyOnceWith("new", "c42");
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "c42");
    expect(screen.getByTestId("conversation-list")).toHaveAttribute("data-active-id", "42");
    expect(conversationQuery).toHaveBeenLastCalledWith(42);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(window.history.state, "", "/ai/chat/42");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("真实路由变化后重新采用路由中的会话状态", async () => {
    vi.spyOn(window.history, "replaceState").mockImplementation((_state, _unused, url) => {
      navigation.pathname = String(url);
    });
    const view = renderWithProviders(<ChatPage />);
    await screen.findByTestId("conversation-list");
    fireEvent.click(screen.getByTestId("chat-panel"));
    view.rerender(<ChatPage />);
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "c42");

    navigation.pathname = "/ai/chat";
    view.rerender(<ChatPage />);

    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "new");
    expect(screen.getByTestId("conversation-list")).toHaveAttribute("data-active-id", "0");
    expect(conversationQuery).toHaveBeenLastCalledWith(0);
  });

  it("已有会话里不再触发会话创建回填", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    renderWithProviders(<ChatPage conversationId={9} />);

    fireEvent.click(screen.getByTestId("chat-panel"));

    expect(store.renameKey).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "c9");
  });
});
