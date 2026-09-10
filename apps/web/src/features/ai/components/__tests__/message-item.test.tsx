import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// TiptapEditor 是 dynamic(ssr:false) 组件，在 jsdom 里只渲染 loading 骨架；
// 用桩替换以断言「完成后用 readonly 编辑器渲染」这一行为。
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value, preset }: { value: string; preset: string }) => (
    <div data-testid="tiptap-editor-stub" data-preset={preset}>
      {value}
    </div>
  ),
}));

import { MessageItem } from "@/features/ai/components/message-item";

describe("MessageItem", () => {
  it("用户消息渲染纯文本气泡", () => {
    render(<MessageItem message={{ id: "1", role: 0, content: "帮我总结" }} />);
    expect(screen.getByText("帮我总结")).toBeTruthy();
    expect(screen.queryByTestId("tiptap-editor-stub")).toBeNull();
  });

  it("助手消息流式中渲染轻量文本与光标，不挂编辑器", () => {
    render(<MessageItem message={{ id: "2", role: 1, content: "部分回答", streaming: true }} />);
    expect(screen.getByTestId("assistant-streaming").textContent).toContain("部分回答");
    expect(screen.queryByTestId("tiptap-editor-stub")).toBeNull();
  });

  it("助手消息完成后用 readonly 编辑器渲染 Markdown", () => {
    render(<MessageItem message={{ id: "3", role: 1, content: "**完成**" }} />);
    const editor = screen.getByTestId("tiptap-editor-stub");
    expect(editor.getAttribute("data-preset")).toBe("readonly");
    expect(editor.textContent).toBe("**完成**");
  });

  it("无内容的流式助手消息展示思考中", () => {
    render(<MessageItem message={{ id: "4", role: 1, content: "", streaming: true }} />);
    expect(screen.getByTestId("assistant-thinking")).toBeTruthy();
  });
});
