import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/features/ai/use-conversations", () => ({
  useConversationQuery: () => ({ data: undefined, isError: false, refetch: vi.fn() }),
}));

vi.mock("@/features/ai/use-chat-stream", () => ({
  useChatStreamStore: (selector: (state: unknown) => unknown) =>
    selector({ renameKey: vi.fn(), hydrate: vi.fn() }),
}));

vi.mock("../chat-panel", () => ({ ChatPanel: () => <div data-testid="chat-panel" /> }));
vi.mock("../conversation-list", () => ({ ConversationList: () => <div /> }));

import { ChatPage } from "@/features/ai/components/chat-page";
import { renderWithProviders } from "@/test/render";

/**
 * AI 对话页布局测试。
 *
 * @author 称霸幼儿园
 */
describe("ChatPage", () => {
  /** 页面占用外壳提供的剩余高度，不自行估算视口高度。 */
  it("使用 Flex 剩余高度而非固定视口减高", () => {
    renderWithProviders(<ChatPage />);

    const page = screen.getByTestId("chat-page");
    expect(page).toHaveClass("flex-1", "min-h-0");
    expect(page.className).not.toContain("100svh");
  });
});
