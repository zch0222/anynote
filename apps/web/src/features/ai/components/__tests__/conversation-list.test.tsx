import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/features/ai/use-chat-scope", () => ({
  useChatKnowledgeBasesQuery: vi.fn(),
}));

const deleteMutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("@/features/ai/use-conversations", () => ({
  useConversationsQuery: vi.fn(),
  useDeleteConversationMutation: vi.fn(() => deleteMutation),
  useRenameConversationMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { ConversationList } from "@/features/ai/components/conversation-list";
import type { Conversation } from "@/features/ai/schemas";
import { useChatKnowledgeBasesQuery } from "@/features/ai/use-chat-scope";
import { useConversationsQuery } from "@/features/ai/use-conversations";
import { emptySurface, useSidePanelStore } from "@/features/side-panel/store";
import { asTabId } from "@/features/side-panel/types";
import { renderWithProviders } from "@/test/render";

function mockConversations(returnValue: Record<string, unknown>) {
  vi.mocked(useConversationsQuery).mockReturnValue(returnValue as never);
}

function mockKnowledgeBases(returnValue: Record<string, unknown>) {
  vi.mocked(useChatKnowledgeBasesQuery).mockReturnValue(returnValue as never);
}

function conversation(
  id: number,
  scope: Conversation["scope"] = { knowledgeBaseIds: [1], refs: [] },
): Conversation {
  return { id, title: id === 2 ? null : `会话${id}`, scope };
}

const PENDING = {
  isPending: true,
  isError: false,
  data: undefined,
};

const READY_BASES = {
  isPending: false,
  isError: false,
  data: [
    { id: 1, knowledgeBaseName: "知识库一" },
    { id: 2, knowledgeBaseName: "知识库二" },
  ],
};

function ready(rows: Conversation[]) {
  return { ...PENDING, isPending: false, data: rows };
}

function visibleConversationCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-testid^="conversation-item-"]').length;
}

/** 在真实 store 里挂一个带活动笔记标签的分区，并登记返回固定结果的离开守卫。 */
function mountGuard(surfaceKey: string, allow: boolean) {
  const surface = emptySurface();
  surface.open = true;
  surface.tabs = [
    {
      id: asTabId("t1"),
      kind: "note",
      family: "resource",
      ref: { type: "note", id: 1, kbId: 3 },
    },
  ];
  surface.activeId = asTabId("t1");
  surface.recent = [asTabId("t1")];
  surface.seq = 1;
  const guard = vi.fn(() => allow);
  useSidePanelStore.setState({
    surfaces: { [surfaceKey]: surface },
    guards: { [surfaceKey]: guard },
    newWindowHandlers: {},
  });
  return guard;
}

/**
 * 桌面知识库分组会话列表测试。
 *
 * @author 称霸幼儿园
 */
describe("ConversationList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
    mockKnowledgeBases(READY_BASES);
  });

  /** 会话加载期间显示共享列表骨架。 */
  it("加载中渲染骨架", () => {
    mockConversations(PENDING);
    const { container } = renderWithProviders(<ConversationList activeId={0} surface="chat:new" />);
    expect(container.querySelector('[data-slot="skeleton-list"]')).toBeTruthy();
    expect(screen.getByTestId("conversation-new")).toBeTruthy();
  });

  /** 知识库名称未就绪时不展示会变化的临时组名。 */
  it("知识库加载中继续显示骨架", () => {
    mockConversations(ready([conversation(1)]));
    mockKnowledgeBases({ ...READY_BASES, isPending: true, data: undefined });
    const { container } = renderWithProviders(<ConversationList activeId={0} surface="chat:new" />);
    expect(container.querySelector('[data-slot="skeleton-list"]')).toBeTruthy();
    expect(screen.queryByTestId("conversation-item-1")).toBeNull();
  });

  /** 会话行保持原选中态和未命名标题。 */
  it("渲染会话并高亮当前选中", () => {
    mockConversations(ready([conversation(1), conversation(2)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);
    expect(screen.getByTestId("conversation-item-1").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("conversation-item-2").getAttribute("data-active")).toBe("false");
    expect(screen.getByText("会话1")).toBeTruthy();
    expect(screen.getByTitle("未命名会话")).toBeTruthy();
  });

  /** 知识库按目录顺序排列，其他会话和全部知识库固定置底。 */
  it("按知识库分组并使用确认的标题和顺序", () => {
    mockConversations(
      ready([
        conversation(1),
        conversation(2, { knowledgeBaseIds: [2], refs: [] }),
        conversation(3, { knowledgeBaseIds: [1, 2], refs: [] }),
        conversation(4, { knowledgeBaseIds: [], refs: [] }),
      ]),
    );
    mockKnowledgeBases({ ...READY_BASES, data: [...READY_BASES.data].reverse() });
    const { container } = renderWithProviders(<ConversationList activeId={0} surface="chat:new" />);

    expect(screen.getByText("对话列表")).toBeTruthy();
    expect(
      [...container.querySelectorAll("section[data-group-key]")].map((section) =>
        section.getAttribute("data-group-key"),
      ),
    ).toEqual(["kb:2", "kb:1", "other", "all"]);
    expect(screen.getByRole("button", { name: "其他会话" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "全部知识库" })).toBeTruthy();
  });

  /** 分组标题控制本会话组的展开与折叠。 */
  it("支持折叠和重新展开知识库分组", () => {
    mockConversations(ready([conversation(1)]));
    renderWithProviders(<ConversationList activeId={0} surface="chat:new" />);
    const toggle = screen.getByRole("button", { name: "知识库一" });

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("conversation-item-1")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId("conversation-item-1")).toBeTruthy();
  });

  /** 每组默认五条，显示更多每次增加五条，全部显示后可收起。 */
  it("组内按五条递增展开并支持收起", () => {
    mockConversations(ready(Array.from({ length: 7 }, (_, index) => conversation(index + 1))));
    const { container } = renderWithProviders(<ConversationList activeId={0} surface="chat:new" />);

    expect(visibleConversationCount(container)).toBe(5);
    fireEvent.click(screen.getByRole("button", { name: "显示更多" }));
    expect(visibleConversationCount(container)).toBe(7);
    fireEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(visibleConversationCount(container)).toBe(5);
  });

  /** 没有会话时保留原空态提示。 */
  it("空会话展示空态", () => {
    mockConversations(ready([]));
    renderWithProviders(<ConversationList activeId={0} surface="chat:new" />);
    expect(screen.getByText("还没有历史会话")).toBeTruthy();
  });

  /** 会话请求失败时保留原错误信息。 */
  it("加载失败展示错误信息", () => {
    mockConversations({
      ...PENDING,
      isPending: false,
      isError: true,
      error: new Error("网络异常"),
    });
    renderWithProviders(<ConversationList activeId={0} surface="chat:new" />);
    expect(screen.getByText(/会话加载失败/)).toBeTruthy();
  });

  /** 触摸端常显操作入口，桌面端继续使用悬停揭示。 */
  it("操作按钮在触摸端常显，md 以上才靠 hover 揭示", () => {
    mockConversations(ready([conversation(1)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    const trigger = screen.getByLabelText("会话「会话1」操作");
    expect(trigger.className).toContain("md:opacity-0");
    expect(trigger.className).not.toMatch(/(^|\s)opacity-0/);
  });

  /** 离开守卫拒绝时，点击其他会话与新对话都不导航。 */
  it("离开守卫拒绝时不切换会话也不新建对话", () => {
    window.history.replaceState(null, "", "/ai/chat/1");
    const guard = mountGuard("chat:c1", false);
    mockConversations(ready([conversation(1), conversation(2)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    fireEvent.click(screen.getByRole("button", { name: "未命名会话" }));
    expect(guard).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("conversation-new"));
    expect(router.push).not.toHaveBeenCalled();
  });

  /** 离开守卫允许时，正常切到目标会话与新对话。 */
  it("离开守卫允许时切换会话与新建对话", () => {
    window.history.replaceState(null, "", "/ai/chat/1");
    const guard = mountGuard("chat:c1", true);
    mockConversations(ready([conversation(1), conversation(2)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    fireEvent.click(screen.getByRole("button", { name: "未命名会话" }));
    expect(guard).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/ai/chat/2");

    fireEvent.click(screen.getByTestId("conversation-new"));
    expect(router.push).toHaveBeenCalledWith("/ai/chat");
  });

  /** 目标与当前地址相同时不走守卫，直接按原逻辑导航。 */
  it("目标与当前地址相同时不走守卫", () => {
    window.history.replaceState(null, "", "/ai/chat/1");
    const guard = mountGuard("chat:c1", false);
    mockConversations(ready([conversation(1)]));
    const view = renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    fireEvent.click(screen.getByRole("button", { name: "会话1" }));
    expect(guard).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/ai/chat/1");

    view.unmount();
    router.push.mockClear();
    window.history.replaceState(null, "", "/ai/chat");
    const newGuard = mountGuard("chat:new", false);
    renderWithProviders(<ConversationList activeId={0} surface="chat:new" />);
    fireEvent.click(screen.getByTestId("conversation-new"));
    expect(newGuard).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/ai/chat");
  });

  /** 删除当前会话：删除确认后守卫允许才发请求，并跳回新对话页。 */
  it("删除当前会话经守卫允许后删除并跳回新对话", async () => {
    mountGuard("chat:c1", true);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockConversations(ready([conversation(1)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    fireEvent.click(screen.getByLabelText("会话「会话1」操作"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(deleteMutation.mutateAsync).toHaveBeenCalledWith(1));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/ai/chat"));
  });

  /** 删除非当前会话不走离开守卫，删除后不跳转。 */
  it("删除非当前会话不走守卫也不跳转", async () => {
    const guard = mountGuard("chat:c1", false);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mockConversations(ready([conversation(1), conversation(2)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    fireEvent.click(screen.getByLabelText("会话「未命名会话」操作"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));

    await waitFor(() => expect(deleteMutation.mutateAsync).toHaveBeenCalledWith(2));
    expect(guard).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  /** 删除当前会话：删除确认先弹，守卫拒绝则不发请求。 */
  it("删除当前会话确认后守卫拒绝则不发请求", async () => {
    const guard = mountGuard("chat:c1", false);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    mockConversations(ready([conversation(1)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    fireEvent.click(screen.getByLabelText("会话「会话1」操作"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(guard).toHaveBeenCalled();
    const [confirmOrder] = confirmSpy.mock.invocationCallOrder;
    const [guardOrder] = guard.mock.invocationCallOrder;
    expect(confirmOrder).toBeTypeOf("number");
    expect(guardOrder).toBeTypeOf("number");
    expect(confirmOrder as number).toBeLessThan(guardOrder as number);
    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled();
  });

  /** 取消删除确认时不走守卫也不发请求。 */
  it("取消删除确认不走守卫也不发请求", async () => {
    const guard = mountGuard("chat:c1", false);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockConversations(ready([conversation(1)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    fireEvent.click(screen.getByLabelText("会话「会话1」操作"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除" }));

    expect(guard).not.toHaveBeenCalled();
    expect(deleteMutation.mutateAsync).not.toHaveBeenCalled();
  });

  /** 「重命名」菜单项打开重命名对话框。 */
  it("重命名菜单项打开重命名对话框", async () => {
    mockConversations(ready([conversation(1)]));
    renderWithProviders(<ConversationList activeId={1} surface="chat:c1" />);

    fireEvent.click(screen.getByLabelText("会话「会话1」操作"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "重命名" }));

    expect(await screen.findByText("重命名会话")).toBeTruthy();
  });
});
