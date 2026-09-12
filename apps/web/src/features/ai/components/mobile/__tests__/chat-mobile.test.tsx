import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/ai/chat/9",
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
  it("已有会话用正式 key，并把历史灌进流式 store", () => {
    mockDetail({
      isPending: false,
      isError: false,
      data: {
        conversation: { id: 9, title: "聊聊架构" },
        messages: [{ role: 0, content: "在？" }],
      },
    });
    renderWithProviders(<MobileChat conversationId={9} />);

    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "c9");
    expect(store.hydrate).toHaveBeenCalledWith("c9", [{ role: 0, content: "在？" }], 9);
    expect(screen.getByRole("heading", { name: "聊聊架构" })).toBeInTheDocument();
  });

  it("新对话用固定 key，标题写「新对话」", () => {
    mockDetail({ isPending: false, isError: false, data: undefined });
    renderWithProviders(<MobileChat />);

    expect(screen.getByTestId("chat-panel")).toHaveAttribute("data-session-key", "new");
    expect(screen.getByRole("heading", { name: "新对话" })).toBeInTheDocument();
  });

  it("新会话拿到 id 后迁移 key 并回填路由，不重发请求", () => {
    mockDetail({ isPending: false, isError: false, data: undefined });
    renderWithProviders(<MobileChat />);

    fireEvent.click(screen.getByTestId("chat-panel"));

    expect(store.renameKey).toHaveBeenCalledWith("new", "c42");
    expect(router.replace).toHaveBeenCalledWith("/m/ai/chat/42");
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
});
