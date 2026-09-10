import { ChatInput } from "@/features/ai/components/chat-input";
import { renderWithProviders } from "@/test/render";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("ChatInput", () => {
  it("输入后点击发送，回调携带去除首尾空白的 prompt 并清空输入框", () => {
    const onSend = vi.fn();
    const { getByTestId } = renderWithProviders(
      <ChatInput streaming={false} onSend={onSend} onStop={vi.fn()} />,
    );
    const input = getByTestId("chat-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "  你好  " } });
    fireEvent.click(getByTestId("chat-send"));
    expect(onSend).toHaveBeenCalledWith("你好");
    expect(input.value).toBe("");
  });

  it("Enter 发送，Shift+Enter 换行不发送", () => {
    const onSend = vi.fn();
    const { getByTestId } = renderWithProviders(
      <ChatInput streaming={false} onSend={onSend} onStop={vi.fn()} />,
    );
    const input = getByTestId("chat-input");
    fireEvent.change(input, { target: { value: "q" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("IME 组合中的 Enter 不发送", () => {
    const onSend = vi.fn();
    const { getByTestId } = renderWithProviders(
      <ChatInput streaming={false} onSend={onSend} onStop={vi.fn()} />,
    );
    const input = getByTestId("chat-input");
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ni" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.compositionEnd(input);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("空内容时发送按钮禁用", () => {
    const onSend = vi.fn();
    const { getByTestId } = renderWithProviders(
      <ChatInput streaming={false} onSend={onSend} onStop={vi.fn()} />,
    );
    expect((getByTestId("chat-send") as HTMLButtonElement).disabled).toBe(true);
  });

  it("流式中展示停止按钮；点击触发 onStop 且隐藏发送", () => {
    const onStop = vi.fn();
    const { getByTestId, queryByTestId } = renderWithProviders(
      <ChatInput streaming onSend={vi.fn()} onStop={onStop} />,
    );
    expect(queryByTestId("chat-send")).toBeNull();
    fireEvent.click(getByTestId("chat-stop"));
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
