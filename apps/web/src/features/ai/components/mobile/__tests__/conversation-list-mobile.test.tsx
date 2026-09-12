import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/ai/chat",
}));

const deleteMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => undefined),
  isPending: false,
}));
const renameMutation = vi.hoisted(() => ({
  mutateAsync: vi.fn(async () => undefined),
  isPending: false,
}));
vi.mock("@/features/ai/use-conversations", () => ({
  useConversationsInfinite: vi.fn(),
  useDeleteConversationMutation: () => deleteMutation,
  useRenameConversationMutation: () => renameMutation,
}));

import { MobileConversationList } from "@/features/ai/components/mobile/conversation-list-mobile";
import { useConversationsInfinite } from "@/features/ai/use-conversations";
import { renderWithProviders } from "@/test/render";

const IDLE = {
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: vi.fn(),
};

function mockRows(rows: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  vi.mocked(useConversationsInfinite).mockReturnValue({
    ...IDLE,
    data: { pages: [{ rows }] },
    ...extra,
  } as never);
}

describe("MobileConversationList", () => {
  it("会话列表独立成页，点进去是全屏对话", () => {
    mockRows([{ id: 9, title: "聊聊架构" }]);
    renderWithProviders(<MobileConversationList />);

    expect(screen.getByRole("link", { name: /聊聊架构/ })).toHaveAttribute("href", "/m/ai/chat/9");
    expect(screen.getByTestId("mobile-conversation-new")).toHaveAttribute("href", "/m/ai/chat/new");
  });

  it("没有标题的会话有兜底文案", () => {
    mockRows([{ id: 9, title: null }]);
    renderWithProviders(<MobileConversationList />);
    expect(screen.getByText("未命名会话")).toBeInTheDocument();
  });

  it("空列表引导去开新对话", () => {
    mockRows([]);
    renderWithProviders(<MobileConversationList />);
    expect(screen.getByText("还没有历史会话")).toBeInTheDocument();
  });

  it("加载失败展示错误", () => {
    vi.mocked(useConversationsInfinite).mockReturnValue({
      ...IDLE,
      isError: true,
      error: new Error("网络异常"),
    } as never);
    renderWithProviders(<MobileConversationList />);
    expect(screen.getByText(/会话加载失败：网络异常/)).toBeInTheDocument();
  });

  it("操作入口是常显按钮 + 底部动作表，不依赖 hover", () => {
    mockRows([{ id: 9, title: "聊聊架构" }]);
    renderWithProviders(<MobileConversationList />);

    const trigger = screen.getByRole("button", { name: "会话「聊聊架构」操作" });
    expect(trigger.className).not.toMatch(/(^|\s)opacity-0/);

    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "重命名" })).toBeInTheDocument();
  });

  it("删除需要二次确认", async () => {
    mockRows([{ id: 9, title: "聊聊架构" }]);
    renderWithProviders(<MobileConversationList />);

    fireEvent.click(screen.getByRole("button", { name: "会话「聊聊架构」操作" }));
    fireEvent.click(screen.getByRole("button", { name: "删除会话" }));
    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "再点一次确认删除" }));
    await waitFor(() => {
      expect(deleteMutation.mutateAsync).toHaveBeenCalledWith(9);
    });
  });

  it("重命名走对话框并提交新标题", async () => {
    mockRows([{ id: 9, title: "聊聊架构" }]);
    renderWithProviders(<MobileConversationList />);

    fireEvent.click(screen.getByRole("button", { name: "会话「聊聊架构」操作" }));
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));

    const input = await screen.findByTestId("conversation-rename-input");
    fireEvent.change(input, { target: { value: "架构讨论" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(renameMutation.mutateAsync).toHaveBeenCalledWith({
        conversationId: 9,
        title: "架构讨论",
      });
    });
  });

  it("还有下一页时提供加载更多", () => {
    const fetchNextPage = vi.fn();
    mockRows([{ id: 9, title: "会话" }], { hasNextPage: true, fetchNextPage });
    renderWithProviders(<MobileConversationList />);

    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
