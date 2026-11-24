vi.mock("../chat-scope-select", () => ({ ChatScopeSelect: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { abortMock, sendMock, session } = vi.hoisted(() => ({
  abortMock: vi.fn(),
  sendMock: vi.fn(),
  session: {
    current: {
      messages: [],
      status: "idle",
      error: null,
      conversationId: null,
    },
  },
}));

vi.mock("@/features/ai/use-chat-stream", () => ({
  useChatSession: () => session.current,
  useChatStreamStore: (selector: (state: unknown) => unknown) =>
    selector({ send: sendMock, abort: abortMock, setScope: vi.fn() }),
}));

import { ChatPanel } from "@/features/ai/components/chat-panel";
import { SidePanelLinkContext } from "@/features/side-panel/link-context";
import { renderWithProviders } from "@/test/render";

/**
 * 对话面板状态与布局测试。
 *
 * @author 称霸幼儿园
 */
describe("ChatPanel", () => {
  /** 会话范围恢复前不允许发送，避免意外创建其他范围的运行。 */
  it("恢复历史期间禁用输入", () => {
    renderWithProviders(<ChatPanel sessionKey="c1" historyStatus="pending" />);
    expect(screen.getByTestId("chat-input")).toBeDisabled();
    expect(screen.getByText("加载中…")).toBeVisible();
  });

  /** 有侧栏宿主时给消息列表加标记，离开保护据此跳过。 */
  it("有侧栏宿主时标记消息列表", () => {
    const view = renderWithProviders(<ChatPanel sessionKey="c1" />);
    expect(screen.getByTestId("message-list")).not.toHaveAttribute("data-side-panel-links");

    view.rerender(
      <SidePanelLinkContext.Provider value={() => {}}>
        <ChatPanel sessionKey="c1" />
      </SidePanelLinkContext.Provider>,
    );
    expect(screen.getByTestId("message-list")).toHaveAttribute("data-side-panel-links");
  });

  /** 历史加载与失败状态只显示自身，不叠加新对话空态。 */
  it("历史状态不与空对话提示同时出现", () => {
    const { rerender } = renderWithProviders(<ChatPanel sessionKey="c1" historyStatus="pending" />);
    expect(screen.queryByText("开始新的对话")).toBeNull();

    rerender(<ChatPanel sessionKey="c1" historyStatus="error" />);
    expect(screen.getByText("服务暂时不可用，请稍后重试")).toBeVisible();
    expect(screen.queryByText("开始新的对话")).toBeNull();
  });

  /** 上翻后提供回到底部入口，点击后恢复跟随最新消息。 */
  it("上翻时显示回到最新并支持恢复跟随", () => {
    Object.assign(session.current, {
      messages: [{ id: "m1", role: 0, content: "历史消息" }],
    });
    renderWithProviders(<ChatPanel sessionKey="c1" />);

    const viewport = screen.getByTestId("message-list").parentElement as HTMLDivElement;
    Object.defineProperty(viewport, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 200 });
    const scrollTo = vi.fn();
    viewport.scrollTo = scrollTo;
    fireEvent.scroll(viewport, { target: { scrollTop: 0 } });

    const backToLatest = screen.getByRole("button", { name: "回到最新" });
    fireEvent.click(backToLatest);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "smooth" });
    expect(screen.queryByRole("button", { name: "回到最新" })).toBeNull();
  });

  beforeEach(() => {
    sendMock.mockReset();
    abortMock.mockReset();
    session.current = {
      messages: [],
      status: "idle",
      error: null,
      conversationId: null,
    };
    window.localStorage.clear();
  });

  it("知识检索运行不携带旧厂商模型偏好", () => {
    window.localStorage.setItem("anynote-ai-model", "deepseek_deepseek-r1");
    renderWithProviders(<ChatPanel sessionKey="new" />);

    fireEvent.change(screen.getByTestId("chat-input"), { target: { value: "问题" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(sendMock).toHaveBeenCalledOnce();
    const args = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args).toMatchObject({ key: "new", prompt: "问题" });
    expect(args).not.toHaveProperty("model");
  });

  /** 只给最后一条已完成的助手回答提供重新提问，并复用最后一轮用户原文。 */
  it("重新提问追加最后一轮用户消息", () => {
    Object.assign(session.current, {
      messages: [
        { id: "u1", role: 0, content: "第一问" },
        { id: "a1", role: 1, content: "第一答" },
        { id: "u2", role: 0, content: "第二问" },
        { id: "a2", role: 1, content: "第二答" },
      ],
    });
    renderWithProviders(<ChatPanel sessionKey="c1" />);

    expect(screen.getAllByRole("button", { name: "复制" })).toHaveLength(4);
    const retry = screen.getByRole("button", { name: "重新提问" });
    fireEvent.click(retry);

    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0]?.[0]).toMatchObject({ key: "c1", prompt: "第二问" });
  });

  /** 流式期间和已取消的回答不显示重新提问。 */
  it("非完成状态不提供重新提问", () => {
    Object.assign(session.current, {
      messages: [
        { id: "u1", role: 0, content: "问题" },
        { id: "a1", role: 1, content: "部分回答", streaming: true },
      ],
      status: "streaming",
    });
    const { rerender } = renderWithProviders(<ChatPanel sessionKey="c1" />);
    expect(screen.queryByRole("button", { name: "重新提问" })).toBeNull();

    Object.assign(session.current, {
      messages: [
        { id: "u1", role: 0, content: "问题" },
        { id: "a1", role: 1, content: "已停止的回答", outcome: "CANCELLED" },
      ],
      status: "idle",
    });
    rerender(<ChatPanel sessionKey="c1" />);
    expect(screen.queryByRole("button", { name: "重新提问" })).toBeNull();
  });

  /** 文档问答继续使用原有范围提示和输入布局。 */
  it("文档问答不受对话页布局改造影响", () => {
    const { container } = renderWithProviders(
      <ChatPanel sessionKey="doc7" docId={7} emptyHint="就当前文档提问" />,
    );

    expect(screen.getByText("检索范围：当前资料")).toBeVisible();
    expect(screen.getByText("就当前文档提问")).toBeVisible();
    expect(screen.queryByTestId("chat-empty")).toBeNull();
    expect(container.querySelector("form")).not.toHaveClass("rounded-2xl");
  });
});
