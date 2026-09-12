import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/tasks",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({ useKnowledgeBasesQuery: vi.fn() }));
vi.mock("@/features/notes/use-notes", () => ({
  useNotesQuery: vi.fn(() => ({ isPending: false, isError: false, data: { rows: [] } })),
}));
vi.mock("@/features/tasks/use-tasks", () => ({
  useTasksQuery: vi.fn(),
  useSubmitTaskMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { MobileTaskCards } from "@/features/tasks/components/mobile/task-cards-mobile";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false };
const FUTURE = "2099-01-01T00:00:00";
const PAST = "2020-01-01T00:00:00";

function setup(
  tasks: Array<Record<string, unknown>>,
  bases = [{ id: 3, knowledgeBaseName: "库" }],
) {
  vi.mocked(useKnowledgeBasesQuery).mockReturnValue({ ...IDLE, data: bases } as never);
  vi.mocked(useTasksQuery).mockReturnValue({ ...IDLE, data: { rows: tasks } } as never);
}

describe("MobileTaskCards", () => {
  it("渲染任务卡片与状态徽章", () => {
    setup([
      { id: 1, taskName: "读论文", taskDescribe: "本周内", submissionStatus: 0, endTime: FUTURE },
    ]);
    renderWithProviders(<MobileTaskCards />);

    expect(screen.getByTestId("task-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("task-status")).toHaveTextContent("未提交");
    expect(screen.getByText("本周内")).toBeInTheDocument();
  });

  it("已截止的任务不能提交", () => {
    setup([{ id: 1, taskName: "过期任务", submissionStatus: 0, endTime: PAST }]);
    renderWithProviders(<MobileTaskCards />);

    expect(screen.getByTestId("task-submit-1")).toBeDisabled();
    expect(screen.getByText(/已截止/)).toBeInTheDocument();
  });

  it("已提交的任务按钮变成重新提交", () => {
    setup([{ id: 1, taskName: "已交任务", submissionStatus: 1, endTime: FUTURE }]);
    renderWithProviders(<MobileTaskCards />);

    expect(screen.getByTestId("task-submit-1")).toHaveTextContent("重新提交");
  });

  it("状态筛选只保留对应状态的任务", () => {
    setup([
      { id: 1, taskName: "未提交任务", submissionStatus: 0, endTime: FUTURE },
      { id: 2, taskName: "已提交任务", submissionStatus: 1, endTime: FUTURE },
    ]);
    renderWithProviders(<MobileTaskCards />);

    fireEvent.click(screen.getByTestId("task-filter"));
    fireEvent.click(screen.getByRole("button", { name: "已提交" }));

    expect(screen.queryByTestId("task-card-1")).toBeNull();
    expect(screen.getByTestId("task-card-2")).toBeInTheDocument();
  });

  it("筛选后没有结果时提示换条件", () => {
    setup([{ id: 1, taskName: "未提交任务", submissionStatus: 0, endTime: FUTURE }]);
    renderWithProviders(<MobileTaskCards />);

    fireEvent.click(screen.getByTestId("task-filter"));
    fireEvent.click(screen.getByRole("button", { name: "已退回" }));

    expect(screen.getByText("没有已退回的任务")).toBeInTheDocument();
  });

  it("没有知识库时给出引导而不是空列表", () => {
    setup([], []);
    renderWithProviders(<MobileTaskCards />);
    expect(screen.getByText("还没有可用的知识库")).toBeInTheDocument();
  });

  it("加载失败展示错误", () => {
    vi.mocked(useKnowledgeBasesQuery).mockReturnValue({
      ...IDLE,
      data: [{ id: 3, knowledgeBaseName: "库" }],
    } as never);
    vi.mocked(useTasksQuery).mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("网络异常"),
    } as never);
    renderWithProviders(<MobileTaskCards />);
    expect(screen.getByText(/任务加载失败：网络异常/)).toBeInTheDocument();
  });

  // 对话框是按需加载的（省首屏预算），所以这里要等它挂上
  it("点提交打开桌面同一个提交对话框", async () => {
    setup([{ id: 1, taskName: "读论文", submissionStatus: 0, endTime: FUTURE }]);
    renderWithProviders(<MobileTaskCards />);

    fireEvent.click(screen.getByTestId("task-submit-1"));
    // 全量并行跑时这个动态 import 可能超过默认的 1s 等待
    expect(
      await screen.findByText("提交任务「读论文」", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("选择一篇笔记作为任务成果提交。")).toBeInTheDocument();
  });
});
