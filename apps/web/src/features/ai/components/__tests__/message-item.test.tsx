import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// TiptapEditor 是 dynamic(ssr:false) 组件，在 jsdom 里只渲染 loading 骨架；
// 用桩替换以断言完成后的 AI 回答预设。
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value, preset }: { value: string; preset: string }) => (
    <div data-testid="tiptap-editor-stub" data-preset={preset}>
      {value}
    </div>
  ),
}));

import { MessageItem } from "@/features/ai/components/message-item";

/**
 * 对话消息展示测试。
 *
 * @author 称霸幼儿园
 */
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

  it("助手消息完成后统一用 aiAnswer 渲染 Markdown", () => {
    render(<MessageItem message={{ id: "3", role: 1, content: "**完成**" }} />);
    const editor = screen.getByTestId("tiptap-editor-stub");
    expect(editor.getAttribute("data-preset")).toBe("aiAnswer");
    expect(editor.textContent).toBe("**完成**");
  });

  it("无内容的流式助手消息展示思考中", () => {
    render(<MessageItem message={{ id: "4", role: 1, content: "", streaming: true }} />);
    expect(screen.getByTestId("assistant-thinking")).toBeTruthy();
  });

  it("完成后逐行展示三种回答标注", () => {
    render(
      <MessageItem
        message={{
          id: "5",
          role: 1,
          content: "回答",
          answerNotices: ["UNSOURCED", "NOT_FROM_KNOWLEDGE", "CITATIONS_REMOVED"],
        }}
      />,
    );

    expect(screen.getByText("这条回答没有标注来源，内容可能不完全来自你的知识库")).toBeVisible();
    expect(screen.getByText("这条回答不是来自你的知识库")).toBeVisible();
    expect(screen.getByText("部分无法核对的引用已移除")).toBeVisible();
  });

  it("无标注或流式期间不显示标注区域", () => {
    const { rerender } = render(<MessageItem message={{ id: "6", role: 1, content: "回答" }} />);
    expect(screen.queryByTestId("answer-notices")).toBeNull();

    rerender(
      <MessageItem
        message={{
          id: "6",
          role: 1,
          content: "回答",
          streaming: true,
          answerNotices: ["UNSOURCED"],
        }}
      />,
    );
    expect(screen.queryByTestId("answer-notices")).toBeNull();
  });

  /** AI 对话提供消息操作，文档问答不新增操作栏。 */
  it("按展示场景隔离消息操作", () => {
    const { rerender } = render(
      <MessageItem message={{ id: "8", role: 1, content: "回答" }} presentation="conversation" />,
    );
    expect(screen.getByRole("button", { name: "复制" })).toBeVisible();

    rerender(<MessageItem message={{ id: "8", role: 1, content: "回答" }} />);
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
  });

  /** 对话页使用品牌浅色用户气泡，文档问答默认样式保持不变。 */
  it("按展示场景隔离用户气泡样式", () => {
    const { rerender } = render(
      <MessageItem message={{ id: "7", role: 0, content: "问题" }} presentation="conversation" />,
    );
    expect(screen.getByText("问题")).toHaveClass("bg-accent-soft");

    rerender(<MessageItem message={{ id: "7", role: 0, content: "问题" }} />);
    expect(screen.getByText("问题")).toHaveClass("bg-accent");
  });
});
