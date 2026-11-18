import { EMPTY_PROCESS } from "@/lib/ai/process";
import type { ProcessState } from "@/lib/ai/process";
import { renderWithProviders } from "@/test/render";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessArea } from "../process-area";

vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value, preset }: { value: string; preset: string }) => (
    <div data-testid="tiptap-editor-stub" data-preset={preset}>
      {value}
    </div>
  ),
}));

/**
 * 构造一个含思考与工具行的过程状态。
 *
 * @returns 过程状态
 */
function sampleProcess(): ProcessState {
  return {
    active: true,
    items: [
      {
        type: "reasoning",
        blockId: "b1",
        text: "先看用户有哪些和课程相关的知识库",
        status: "done",
        durationMs: 2100,
      },
      {
        type: "tool",
        callId: "c1",
        name: "kb_search",
        target: { label: "期末复习", resolved: true },
        status: "SUCCESS",
        durationMs: 820,
        result: { count: 5, items: [{ ref: "note:12", title: "提纲", kbName: "课程库" }] },
      },
      { type: "note", text: "先看看目录" },
      { type: "retry" },
    ],
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("运行过程区", () => {
  it("流式中展开并显示已确认的动作与对象文案", () => {
    vi.useFakeTimers();
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming />);
    expect(screen.getByText(/思考中 · \d+ 秒/)).toBeInTheDocument();
    expect(screen.getByText("检索知识库")).toBeInTheDocument();
    expect(screen.getByText(/· 期末复习/)).toBeInTheDocument();
    expect(screen.getByText(/命中 5 条/)).toBeInTheDocument();
    expect(screen.getByText("模型连接中断，已重试")).toBeInTheDocument();
    expect(screen.getByText("先看看目录")).toBeInTheDocument();
  });

  it("运行中整轮计时按秒推进", () => {
    vi.useFakeTimers();
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming />);
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.getByText("思考中 · 2 秒")).toBeInTheDocument();
  });

  it("完成后整轮收起为一行并带活动摘要，点击可展开", () => {
    renderWithProviders(
      <ProcessArea process={sampleProcess()} streaming={false} durationMs={18230} />,
    );
    expect(screen.getByText("已完成，用时 18 秒")).toBeInTheDocument();
    expect(screen.getByText(/检索 1 次/)).toBeInTheDocument();
    expect(screen.queryByText("检索知识库")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("process-toggle"));
    expect(screen.getByText("检索知识库")).toBeInTheDocument();
  });

  it("失败与已停止使用已确认文案且过程区保持展开", () => {
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming={false} failed />);
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getAllByText("检索知识库").length).toBeGreaterThan(0);

    cleanup();
    const cancelled = renderWithProviders(
      <ProcessArea process={sampleProcess()} streaming={false} cancelled />,
    );
    expect(cancelled.getByText("已停止")).toBeInTheDocument();
    expect(cancelled.getAllByText("检索知识库").length).toBeGreaterThan(0);
  });

  it("无过程行时不渲染", () => {
    const { container } = renderWithProviders(<ProcessArea process={EMPTY_PROCESS} streaming />);
    expect(container.querySelector('[data-testid="process-area"]')).toBeNull();
  });

  it("思考行默认收起只显示预览，结束后展开用 aiAnswer 渲染", () => {
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming />);
    expect(screen.getByText("先看用户有哪些和课程相关的知识库")).toBeInTheDocument();
    const rowButton = screen
      .getByTestId("process-reasoning")
      .querySelector<HTMLButtonElement>("button");
    expect(rowButton).toBeTruthy();
    fireEvent.click(rowButton as HTMLButtonElement);
    const editor = screen.getByTestId("tiptap-editor-stub");
    expect(editor.getAttribute("data-preset")).toBe("aiAnswer");
  });

  it("工具行展开列出结果条目", () => {
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming />);
    const toolRow = screen.getByTestId("process-tool").querySelector<HTMLButtonElement>("button");
    expect(toolRow).toBeTruthy();
    fireEvent.click(toolRow as HTMLButtonElement);
    expect(screen.getByTestId("process-tool-items")).toBeInTheDocument();
    expect(screen.getByText(/提纲 · 课程库/)).toBeInTheDocument();
  });

  it("无结果条目的工具行不可展开", () => {
    const process: ProcessState = {
      active: true,
      items: [
        {
          type: "tool",
          callId: "c2",
          name: "kb_list",
          status: "SUCCESS",
          result: { count: 3, items: [] },
        },
      ],
    };
    renderWithProviders(<ProcessArea process={process} streaming />);
    const toolRow = screen.getByTestId("process-tool").querySelector<HTMLButtonElement>("button");
    expect(toolRow).toBeTruthy();
    fireEvent.click(toolRow as HTMLButtonElement);
    expect(screen.queryByTestId("process-tool-items")).toBeNull();
    expect(screen.getByText("3 个知识库")).toBeInTheDocument();
  });
});
