import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/m/ai/chat/9" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
}));

const store = vi.hoisted(() => ({ renameKey: vi.fn(), hydrate: vi.fn() }));
vi.mock("@/features/ai/use-chat-stream", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/features/ai/use-chat-stream");
  return {
    ...actual,
    useChatStreamStore: (selector: (state: unknown) => unknown) => selector(store),
  };
});

vi.mock("@/features/ai/use-conversations", () => ({ useConversationQuery: vi.fn() }));

// ChatPanel 会接 SSE 并读模型偏好，这里只验证接线与会话 key
vi.mock("@/features/ai/components/chat-panel", () => ({
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

import { MobileChat } from "@/features/ai/components/mobile/chat-mobile";
import { useConversationQuery } from "@/features/ai/use-conversations";
import { renderWithProviders } from "@/test/render";
import { fireEvent } from "@testing-library/react";

function mockDetail(value: Record<string, unknown>) {
  vi.mocked(useConversationQuery).mockReturnValue(value as never);
}

describe("MobileChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.pathname = "/m/ai/chat/9";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("已有会话用正式 key，并把历史灌进流式 store", () => {
    mockDetail({
      isPending: false,
      isError: false,
      data: {
        conversation: { id: 9, title: "聊聊架构", scope: { knowledgeBaseIds: [3], refs: [] } },
        messages: [{ role: 0, content: "在？" }],
      },
    });
    renderWithProviders(<MobileChat conversationId={9} />);

    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "c9");
    expect(store.hydrate).toHaveBeenCalledWith("c9", [{ role: 0, content: "在？" }], 9, {
      knowledgeBaseIds: [3],
      refs: [],
    });
    expect(screen.getByRole("heading", { name: "聊聊架构" })).toBeInTheDocument();
  });

  it("新对话用固定 key，标题写「新对话」", () => {
    mockDetail({ isPending: false, isError: false, data: undefined });
    renderWithProviders(<MobileChat />);

    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "new");
    expect(screen.getByRole("heading", { name: "新对话" })).toBeInTheDocument();
  });

  it("新会话拿到 id 后同步切换会话并只回填地址栏", () => {
    navigation.pathname = "/m/ai/chat/new";
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation((_state, _unused, url) => {
        navigation.pathname = String(url);
      });
    mockDetail({ isPending: false, isError: false, data: undefined });
    renderWithProviders(<MobileChat />);

    fireEvent.click(screen.getByTestId("chat-panel"));

    expect(store.renameKey).toHaveBeenCalledExactlyOnceWith("new", "c42");
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "c42");
    expect(useConversationQuery).toHaveBeenLastCalledWith(42);
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(window.history.state, "", "/m/ai/chat/42");
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "对话" })).toBeInTheDocument();
  });

  it("真实路由变化后清除本地回填的会话 id", () => {
    navigation.pathname = "/m/ai/chat/new";
    vi.spyOn(window.history, "replaceState").mockImplementation((_state, _unused, url) => {
      navigation.pathname = String(url);
    });
    mockDetail({ isPending: false, isError: false, data: undefined });
    const view = renderWithProviders(<MobileChat />);
    fireEvent.click(screen.getByTestId("chat-panel"));
    view.rerender(<MobileChat />);
    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "c42");

    navigation.pathname = "/m/ai/chat/new";
    view.rerender(<MobileChat />);

    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "new");
    expect(useConversationQuery).toHaveBeenLastCalledWith(0);
    expect(screen.getByRole("heading", { name: "新对话" })).toBeInTheDocument();
  });

  it("已有会话里不再触发路由回填", () => {
    mockDetail({ isPending: false, isError: false, data: undefined });
    router.replace.mockClear();
    store.renameKey.mockClear();
    renderWithProviders(<MobileChat conversationId={9} />);

    fireEvent.click(screen.getByTestId("chat-panel"));

    expect(store.renameKey).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("返回键回会话列表", () => {
    mockDetail({ isPending: false, isError: false, data: undefined });
    renderWithProviders(<MobileChat conversationId={9} />);
    expect(screen.getByTestId("mobile-back")).toBeInTheDocument();
  });

  /** 对话容器建立 Flex 高度链，使输入区贴底而消息区内部滚动。 */
  it("对话面板占满移动内容区", () => {
    mockDetail({ isPending: false, isError: false, data: undefined });
    renderWithProviders(<MobileChat conversationId={9} />);

    expect(screen.getByTestId("mobile-chat")).toHaveClass("flex", "flex-1", "flex-col");
  });
});
