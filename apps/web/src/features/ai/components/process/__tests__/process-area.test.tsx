import { SidePanelLinkContext } from "@/features/side-panel/link-context";
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
 * 构造一个含思考、工具、说明与重试行的过程状态。
 *
 * @returns 过程状态
 */
function sampleProcess(): ProcessState {
  return {
    active: true,
    items: [
      {
        type: "reasoning",
        id: "b1",
        text: "先看用户有哪些和课程相关的知识库",
        status: "done",
        durationMs: 2100,
      },
      {
        type: "tool",
        id: "c1",
        name: "kb_search",
        target: { label: "期末复习", resolved: true },
        status: "SUCCESS",
        durationMs: 820,
        result: {
          count: 5,
          items: [{ ref: "note:12", title: "提纲", kbName: "课程库", kbId: 3 }],
        },
      },
      { type: "note", id: "n1", text: "先看看目录" },
      { type: "retry", id: "r1" },
    ],
  };
}

/**
 * 点开第一条工具行。
 */
function openFirstTool() {
  const toolRow = screen
    .getAllByTestId("process-tool")[0]
    ?.querySelector<HTMLButtonElement>("button");
  if (!toolRow) throw new Error("期望工具行按钮");
  fireEvent.click(toolRow);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("运行过程区", () => {
  it("流式中展开并显示已确认的动作、对象、结果摘要与耗时", () => {
    vi.useFakeTimers();
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming />);
    expect(screen.getByText(/思考中 · \d+ 秒/)).toBeInTheDocument();
    expect(screen.getByText("检索知识库")).toBeInTheDocument();
    expect(screen.getByText(/· 期末复习/)).toBeInTheDocument();
    expect(screen.getByTestId("process-tool-trailing")).toHaveTextContent("命中 5 条 · 0.8 秒");
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

  it("完成后收起为一行，带总用时、首字时间、工具调用次数与活动摘要，点击可展开", () => {
    renderWithProviders(
      <ProcessArea
        process={sampleProcess()}
        streaming={false}
        durationMs={18230}
        firstOutputMs={1200}
        toolCalls={3}
      />,
    );
    expect(
      screen.getByText("已完成，用时 18 秒 · 首字 1.2 秒 · 工具调用 3 次 · 检索 1 次", {
        selector: "button span",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("检索知识库")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("process-toggle"));
    expect(screen.getByText("检索知识库")).toBeInTheDocument();
  });

  it("失败与已停止使用已确认文案且过程区保持展开", () => {
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming={false} failed />);
    expect(screen.getByText("失败", { selector: "button span" })).toBeInTheDocument();
    expect(screen.getAllByText("检索知识库").length).toBeGreaterThan(0);

    cleanup();
    const cancelled = renderWithProviders(
      <ProcessArea process={sampleProcess()} streaming={false} cancelled />,
    );
    expect(cancelled.getByText("已停止", { selector: "button span" })).toBeInTheDocument();
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

  it("工具行展开后结果条目链接到桌面路由", () => {
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming />);
    openFirstTool();
    expect(screen.getByTestId("process-tool-items")).toBeInTheDocument();
    expect(screen.getByTestId("process-tool-item-link")).toHaveAttribute("href", "/notes/3/12");
    expect(screen.getByText(/· 课程库/)).toBeInTheDocument();
  });

  it("移动端结果条目链接到 /m 路由，运行中只显示最新一行，点按展开全部", () => {
    renderWithProviders(<ProcessArea process={sampleProcess()} streaming variant="mobile" />);
    expect(screen.getByTestId("process-retry")).toBeInTheDocument();
    expect(screen.queryByTestId("process-reasoning")).toBeNull();
    expect(screen.queryByTestId("process-tool")).toBeNull();

    fireEvent.click(screen.getByTestId("process-toggle"));
    expect(screen.getByTestId("process-reasoning")).toBeInTheDocument();
    openFirstTool();
    expect(screen.getByTestId("process-tool-item-link")).toHaveAttribute("href", "/m/notes/3/12");
  });

  it("没有知识库标识的条目不可点击，缺标题时显示占位", () => {
    const process: ProcessState = {
      active: true,
      items: [
        {
          type: "tool",
          id: "c3",
          name: "kb_search",
          status: "SUCCESS",
          result: { count: 1, items: [{ ref: "note:9" }] },
        },
      ],
    };
    renderWithProviders(<ProcessArea process={process} streaming />);
    openFirstTool();
    expect(screen.queryByTestId("process-tool-item-link")).toBeNull();
    expect(screen.getByText("未找到或无权访问的内容")).toBeInTheDocument();
  });

  it("失败的工具行显示失败标识与耗时", () => {
    const process: ProcessState = {
      active: true,
      items: [
        {
          type: "tool",
          id: "c4",
          name: "kb_read",
          target: { label: "未找到或无权访问的内容", resolved: false },
          status: "FAILED",
          durationMs: 300,
        },
      ],
    };
    renderWithProviders(<ProcessArea process={process} streaming />);
    const trailing = screen.getByTestId("process-tool-trailing");
    expect(trailing).toHaveTextContent("失败 · 0.3 秒");
    expect(trailing.className).toContain("text-danger");
  });

  it("没有结果条目时不出现多余的分隔符，且工具行不可展开", () => {
    const process: ProcessState = {
      active: true,
      items: [
        {
          type: "tool",
          id: "c2",
          name: "kb_list",
          status: "SUCCESS",
          result: { count: 3, items: [] },
        },
      ],
    };
    renderWithProviders(<ProcessArea process={process} streaming />);
    openFirstTool();
    expect(screen.queryByTestId("process-tool-items")).toBeNull();
    expect(screen.getByTestId("process-tool-trailing").textContent).toBe("3 个知识库");
  });

  it("动画只在用户未要求减少动态效果时播放", () => {
    const process: ProcessState = {
      active: true,
      items: [{ type: "tool", id: "c5", name: "kb_search", status: "running" }],
    };
    renderWithProviders(<ProcessArea process={process} streaming />);
    for (const pulse of [
      screen.getByTestId("process-pulse"),
      screen.getByTestId("process-tool-pulse"),
    ]) {
      const classes = pulse.className.split(/\s+/);
      expect(classes).toContain("motion-safe:animate-pulse");
      expect(classes).not.toContain("animate-pulse");
    }
  });

  it("状态变化有礼貌播报，计时不播报", () => {
    vi.useFakeTimers();
    const view = renderWithProviders(<ProcessArea process={sampleProcess()} streaming />);
    const announcer = screen.getByTestId("process-announcer");
    expect(announcer).toHaveAttribute("aria-live", "polite");
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(announcer.textContent).toBe("思考中");

    view.rerender(
      <ProcessArea process={sampleProcess()} streaming={false} durationMs={5000} toolCalls={1} />,
    );
    expect(screen.getByTestId("process-announcer").textContent).toBe(
      "已完成，用时 5 秒 · 工具调用 1 次 · 检索 1 次",
    );
  });

  /** 有宿主时结果条目单击进侧栏，修饰键与「在新窗口打开」交给浏览器。 */
  it("有宿主时结果条目交给侧栏", () => {
    const open = vi.fn();
    renderWithProviders(
      <SidePanelLinkContext.Provider value={open}>
        <ProcessArea process={sampleProcess()} streaming />
      </SidePanelLinkContext.Provider>,
    );
    openFirstTool();
    const link = screen.getByTestId("process-tool-item-link");

    fireEvent.click(link, { detail: 1 });
    expect(open).toHaveBeenLastCalledWith(
      {
        kind: "tool",
        entry: { ref: "note:12", title: "提纲", kbName: "课程库", kbId: 3 },
      },
      { focus: false },
    );

    fireEvent.click(link, { metaKey: true });
    fireEvent.click(screen.getByRole("link", { name: "在新窗口打开「提纲」" }));
    expect(open).toHaveBeenCalledOnce();
  });
});
