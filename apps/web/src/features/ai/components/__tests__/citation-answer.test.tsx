import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({
    value,
    preset,
    className,
  }: { value: string; preset: string; className?: string }) => (
    <div data-testid="answer-editor" data-preset={preset} data-classname={className}>
      {value}
    </div>
  ),
}));
import { SidePanelLinkContext } from "@/features/side-panel/link-context";
import { CitationAnswer } from "../citation-answer";

/**
 * 引用列表与导航交互测试。
 *
 * @author 称霸幼儿园
 */
describe("CitationAnswer", () => {
  /** 无引用回答也使用 AI 专用预设，且不显示空来源列表。 */
  it("无引用时仅渲染回答正文", () => {
    render(<CitationAnswer content="普通回答" variant="desktop" citations={[]} />);

    expect(screen.getByTestId("answer-editor").getAttribute("data-preset")).toBe("aiAnswer");
    expect(screen.queryByTestId("citation-list")).toBeNull();
  });

  /** 引用展示片段和标记，并使用移动端站内路由。 */
  it("展示来源并导航到对应端的页面", () => {
    render(
      <CitationAnswer
        content="答案[1]"
        variant="mobile"
        citations={[
          {
            index: 1,
            sourceType: "note",
            sourceId: "note:5",
            kbId: 3,
            title: "复习笔记",
            snippet: "原文",
            stale: true,
            authority: "generated",
          },
        ]}
      />,
    );
    expect(screen.getByText("原文")).toBeVisible();
    expect(screen.getByText("模型生成")).toBeVisible();
    expect(screen.getByText("索引滞后")).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "查看引用 1" }));
    expect(push).toHaveBeenCalledWith("/m/notes/3/5");
  });

  /** 当前 PDF 的引用由父面板接管，不重复跳转路由。 */
  it("支持页内 PDF 定位", () => {
    push.mockClear();
    const onCitation = vi.fn(() => true);
    render(
      <CitationAnswer
        content="答案[1]"
        variant="desktop"
        onCitation={onCitation}
        citations={[{ index: 1, sourceType: "doc", sourceId: "doc:7", locator: { pageStart: 2 } }]}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: "查看引用 1" }));
    expect(onCitation).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText("第 2 页")).toBeVisible();
  });

  /** 对话正文按内容撑开，文档问答保留编辑器默认高度。 */
  it("仅在对话场景取消回答正文的最小高度", () => {
    const { rerender } = render(
      <CitationAnswer
        content="短回答"
        variant="desktop"
        citations={[]}
        presentation="conversation"
      />,
    );
    expect(screen.getByTestId("answer-editor").getAttribute("data-classname")).toContain("min-h-0");

    rerender(<CitationAnswer content="短回答" variant="desktop" citations={[]} />);
    expect(screen.getByTestId("answer-editor").getAttribute("data-classname")).not.toContain(
      "min-h-0",
    );
  });

  /** 空片段仍显示标题与定位，不渲染空引用块。 */
  it("支持空引用片段", () => {
    const { container } = render(
      <CitationAnswer
        content="答案[1]"
        variant="desktop"
        citations={[
          {
            index: 1,
            sourceType: "doc",
            sourceId: "doc:7",
            title: "空片段资料",
            locator: { pageStart: 3 },
          },
        ]}
      />,
    );

    expect(screen.getByText("[1] 空片段资料")).toBeVisible();
    expect(screen.getByText("第 3 页")).toBeVisible();
    expect(container.querySelector("blockquote")).toBeNull();
  });

  /** 有宿主时左键单击交给侧栏，键盘触发把焦点带进侧栏。 */
  it("有宿主时把引用点击交给侧栏", () => {
    push.mockClear();
    const open = vi.fn();
    render(
      <SidePanelLinkContext.Provider value={open}>
        <CitationAnswer
          content="答案[1]"
          variant="desktop"
          citations={[
            { index: 1, sourceType: "note", sourceId: "note:5", kbId: 3, title: "复习笔记" },
          ]}
        />
      </SidePanelLinkContext.Provider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "查看引用 1" }), { detail: 1 });
    expect(open).toHaveBeenLastCalledWith(
      {
        kind: "citation",
        citation: {
          index: 1,
          sourceType: "note",
          sourceId: "note:5",
          kbId: 3,
          title: "复习笔记",
        },
      },
      { focus: false },
    );
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: "查看引用 1" }), { detail: 0 });
    expect(open).toHaveBeenLastCalledWith(
      {
        kind: "citation",
        citation: {
          index: 1,
          sourceType: "note",
          sourceId: "note:5",
          kbId: 3,
          title: "复习笔记",
        },
      },
      { focus: true },
    );
  });

  /** 修饰键、中键与「在新窗口打开」保持浏览器原生行为。 */
  it("修饰键与中键不拦截", () => {
    push.mockClear();
    const open = vi.fn();
    render(
      <SidePanelLinkContext.Provider value={open}>
        <CitationAnswer
          content="答案[1]"
          variant="desktop"
          citations={[
            { index: 1, sourceType: "note", sourceId: "note:5", kbId: 3, title: "复习笔记" },
          ]}
        />
      </SidePanelLinkContext.Provider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "查看引用 1" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "查看引用 1" }), { button: 1 });
    fireEvent.click(screen.getByRole("link", { name: "在新窗口打开「复习笔记」" }));

    expect(open).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  /** 页面自己的引用处理优先于侧栏。 */
  it("onCitation 返回真时不打开侧栏", () => {
    push.mockClear();
    const open = vi.fn();
    const onCitation = vi.fn(() => true);
    render(
      <SidePanelLinkContext.Provider value={open}>
        <CitationAnswer
          content="答案[1]"
          variant="desktop"
          onCitation={onCitation}
          citations={[
            { index: 1, sourceType: "note", sourceId: "note:5", kbId: 3, title: "复习笔记" },
          ]}
        />
      </SidePanelLinkContext.Provider>,
    );

    fireEvent.click(screen.getByRole("link", { name: "查看引用 1" }));

    expect(onCitation).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
