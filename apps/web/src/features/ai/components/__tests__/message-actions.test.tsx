import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { MessageActions } from "@/features/ai/components/message-actions";

const writeText = vi.fn();

/**
 * 消息操作栏测试。
 *
 * @author 称霸幼儿园
 */
describe("MessageActions", () => {
  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  /** 复制按钮写入原始 Markdown，并切换为已复制状态。 */
  it("复制原始消息内容", async () => {
    const markdown = "| 标题 |\n| --- |\n| **内容** |";
    render(<MessageActions content={markdown} />);

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(markdown));
    expect(await screen.findByRole("button", { name: "已复制" })).toBeVisible();
    expect(toastError).not.toHaveBeenCalled();
  });

  /** 剪贴板拒绝写入时展示已确认的失败提示。 */
  it("复制失败时展示错误提示", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<MessageActions content="回答" />);

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("复制失败，请手动选择文本复制"));
    expect(screen.getByRole("button", { name: "复制" })).toBeVisible();
  });

  /** 浏览器没有剪贴板接口时保持消息可读并提示复制失败。 */
  it("剪贴板不可用时展示错误提示", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<MessageActions content="回答" />);

    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("复制失败，请手动选择文本复制"));
  });

  /** 传入重新提问回调时显示按钮并原样触发回调。 */
  it("触发重新提问", () => {
    const onRetry = vi.fn();
    render(<MessageActions content="回答" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "重新提问" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });
});
