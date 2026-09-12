import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/features/ai/use-conversations", () => ({
  useConversationsInfinite: vi.fn(),
  useConversationQuery: vi.fn(() => ({ data: undefined, isSuccess: false })),
  useDeleteConversationMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRenameConversationMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { ConversationList } from "@/features/ai/components/conversation-list";
import { useConversationsInfinite } from "@/features/ai/use-conversations";
import { renderWithProviders } from "@/test/render";

function mockConversations(returnValue: Record<string, unknown>) {
  vi.mocked(useConversationsInfinite).mockReturnValue(returnValue as never);
}

const PENDING = {
  isPending: true,
  isError: false,
  data: undefined,
  hasNextPage: false,
  fetchNextPage: vi.fn(),
  isFetchingNextPage: false,
};

describe("ConversationList", () => {
  it("加载中渲染骨架", () => {
    mockConversations(PENDING);
    const { container } = renderWithProviders(<ConversationList activeId={0} />);
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.getByTestId("conversation-new")).toBeTruthy();
  });

  it("渲染会话并高亮当前选中", () => {
    mockConversations({
      ...PENDING,
      isPending: false,
      data: {
        pages: [
          {
            rows: [
              { id: 1, title: "会话一" },
              { id: 2, title: null },
            ],
          },
        ],
      },
    });
    renderWithProviders(<ConversationList activeId={1} />);
    expect(screen.getByTestId("conversation-item-1").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("conversation-item-2").getAttribute("data-active")).toBe("false");
    expect(screen.getByText("会话一")).toBeTruthy();
    expect(screen.getByTitle("未命名会话")).toBeTruthy();
  });

  it("空会话展示空态", () => {
    mockConversations({ ...PENDING, isPending: false, data: { pages: [{ rows: [] }] } });
    renderWithProviders(<ConversationList activeId={0} />);
    expect(screen.getByText("还没有历史会话")).toBeTruthy();
  });

  it("加载失败展示错误信息", () => {
    mockConversations({
      ...PENDING,
      isPending: false,
      isError: true,
      error: new Error("网络异常"),
    });
    renderWithProviders(<ConversationList activeId={0} />);
    expect(screen.getByText(/会话加载失败/)).toBeTruthy();
  });

  // 触摸端没有 hover：操作入口只能常显，否则会话在手机上无法重命名 / 删除（M10.0 T0.4）
  it("操作按钮在触摸端常显，md 以上才靠 hover 揭示", () => {
    mockConversations({
      ...PENDING,
      isPending: false,
      data: { pages: [{ rows: [{ id: 1, title: "会话一" }] }] },
    });
    renderWithProviders(<ConversationList activeId={1} />);

    const trigger = screen.getByLabelText("会话「会话一」操作");
    expect(trigger.className).toContain("md:opacity-0");
    expect(trigger.className).not.toMatch(/(^|\s)opacity-0/);
  });
});
