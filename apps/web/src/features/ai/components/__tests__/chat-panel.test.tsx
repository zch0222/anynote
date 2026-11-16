vi.mock("../chat-scope-select", () => ({ ChatScopeSelect: () => null }));
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { abortMock, sendMock } = vi.hoisted(() => ({
  abortMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("@/features/ai/use-chat-stream", () => ({
  useChatSession: () => ({
    messages: [],
    status: "idle",
    error: null,
    conversationId: null,
  }),
  useChatStreamStore: (selector: (state: unknown) => unknown) =>
    selector({ send: sendMock, abort: abortMock, setScope: vi.fn() }),
}));

import { ChatPanel } from "@/features/ai/components/chat-panel";
import { renderWithProviders } from "@/test/render";

describe("ChatPanel", () => {
  /** 会话范围恢复前不允许发送，避免意外创建其他范围的运行。 */
  it("恢复历史期间禁用输入", () => {
    renderWithProviders(<ChatPanel sessionKey="c1" historyStatus="pending" />);
    expect(screen.getByTestId("chat-input")).toBeDisabled();
    expect(screen.getByText("加载中…")).toBeVisible();
  });
  beforeEach(() => {
    sendMock.mockReset();
    abortMock.mockReset();
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
});
