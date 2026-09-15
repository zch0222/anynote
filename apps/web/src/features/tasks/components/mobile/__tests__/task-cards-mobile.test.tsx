import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/notes/3/tasks",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(),
  useKnowledgeBaseQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: { id: 3, knowledgeBaseName: "我的库", permissions: 3 },
  })),
}));
vi.mock("@/features/notes/use-notes", () => ({
  useNotesQuery: vi.fn(() => ({ isPending: false, isError: false, data: { rows: [] } })),
}));
vi.mock("@/features/tasks/use-tasks", () => ({
  useTasksQuery: vi.fn(),
  useSubmitTaskMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { MobileTaskCards } from "@/features/tasks/components/mobile/task-cards-mobile";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false, isFetching: false };
const FUTURE = "2099-01-01T00:00:00";
const PAST = "2020-01-01T00:00:00";

function setup(tasks: Array<Record<string, unknown>>) {
  vi.mocked(useTasksQuery).mockReturnValue({ ...IDLE, data: { rows: tasks } } as never);
}

describe("MobileTaskCards", () => {
  it("渲染任务行，整行指向任务详情", () => {
    setup([{ id: 1, taskName: "读论文", submissionStatus: 0, endTime: FUTURE }]);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    expect(screen.getByTestId("task-card-1")).toHaveAttribute("href", "/m/notes/3/tasks/1");
    expect(screen.getByText("读论文")).toBeInTheDocument();
  });

  it("顶栏用库名，并带上知识库内的公共头部", () => {
    setup([]);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    expect(screen.getByRole("heading", { name: "我的库" })).toBeInTheDocument();
    expect(screen.getByTestId("mobile-base-header")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-base-tabs")).toBeInTheDocument();
    // 当前 Tab 是「任务」
    expect(screen.getByTestId("mobile-base-tab-tasks")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("mobile-base-tab-notes")).toHaveAttribute("data-active", "false");
  });

  it("状态筛选平铺成全宽 Segmented 并带计数", () => {
    setup([
      { id: 1, taskName: "A", submissionStatus: 0, endTime: FUTURE },
      { id: 2, taskName: "B", submissionStatus: 1, endTime: FUTURE },
      { id: 3, taskName: "C", submissionStatus: 3, endTime: FUTURE },
      { id: 4, taskName: "D", submissionStatus: 2, endTime: FUTURE },
    ]);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    const group = screen.getByRole("radiogroup", { name: "按状态筛选" });
    expect(within(group).getByRole("radio", { name: "全部 4" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "未提交 1" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "已退回 1" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "已提交 1" })).toBeInTheDocument();
  });

  it("切换筛选只保留对应状态的行", () => {
    setup([
      { id: 1, taskName: "未交", submissionStatus: 0, endTime: FUTURE },
      { id: 2, taskName: "已交", submissionStatus: 1, endTime: FUTURE },
    ]);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    fireEvent.click(screen.getByRole("radio", { name: "已提交 1" }));
    expect(screen.queryByTestId("task-card-1")).toBeNull();
    expect(screen.getByTestId("task-card-2")).toBeInTheDocument();
  });

  it("筛选无结果时给出「查看全部」", () => {
    setup([{ id: 1, taskName: "未交", submissionStatus: 0, endTime: FUTURE }]);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    fireEvent.click(screen.getByRole("radio", { name: "已退回 0" }));
    expect(screen.getByText("没有已退回的任务")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看全部" }));
    expect(screen.getByTestId("task-card-1")).toBeInTheDocument();
  });

  it("行尾操作列的真值表（§1.4 第 2、3 条）", () => {
    setup([
      { id: 1, taskName: "未提交且开放", submissionStatus: 0, endTime: FUTURE },
      { id: 2, taskName: "已提交", submissionStatus: 1, endTime: FUTURE },
      { id: 3, taskName: "已退回", submissionStatus: 3, endTime: FUTURE },
      { id: 4, taskName: "未提交但已截止", submissionStatus: 0, endTime: PAST },
      { id: 5, taskName: "管理员自己", submissionStatus: 2, endTime: FUTURE },
    ]);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    // canSubmit → 「提交」
    expect(screen.getByTestId("task-submit-1")).toHaveTextContent("提交");
    // 已提交 → accent 文字「查看」，**不再出「重新提交」**（后端会拒绝重复提交）
    expect(screen.queryByTestId("task-submit-2")).toBeNull();
    expect(screen.getByTestId("task-view-2")).toHaveTextContent("查看");
    expect(screen.getByTestId("task-view-2")).toHaveAttribute("href", "/m/notes/3/tasks/2");
    // canResubmit → 「重新提交」
    expect(screen.getByTestId("task-submit-3")).toHaveTextContent("重新提交");
    // 截止后 → 什么都不出
    expect(screen.queryByTestId("task-submit-4")).toBeNull();
    expect(screen.queryByTestId("task-view-4")).toBeNull();
    // 2（无需提交）→ 没有徽标，也没有操作
    expect(screen.queryByTestId("task-submit-5")).toBeNull();
    expect(screen.queryByTestId("task-view-5")).toBeNull();
  });

  it("徽标变体：0 warning / 1 success / 3 danger / 2 不显示", () => {
    setup([
      { id: 1, taskName: "A", submissionStatus: 0, endTime: FUTURE },
      { id: 2, taskName: "B", submissionStatus: 1, endTime: FUTURE },
      { id: 3, taskName: "C", submissionStatus: 3, endTime: FUTURE },
      { id: 4, taskName: "D", submissionStatus: 2, endTime: FUTURE },
    ]);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    const badges = screen.getAllByTestId("task-status");
    expect(badges).toHaveLength(3);
    expect(badges[0]).toHaveTextContent("未提交");
    expect(badges[1]).toHaveTextContent("已提交");
    expect(badges[2]).toHaveTextContent("已退回");
    // 2 那行在 DOM 里没有徽标
    const row = screen.getByTestId("task-card-4").closest("li");
    expect(row && within(row as HTMLElement).queryByTestId("task-status")).toBeNull();
  });

  it("行尾按钮是链接的兄弟节点，点击不会触发行跳转", () => {
    setup([{ id: 1, taskName: "A", submissionStatus: 0, endTime: FUTURE }]);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    const row = screen.getByTestId("task-card-1");
    const button = screen.getByTestId("task-submit-1");
    // <a> 里不能嵌 <button>：浏览器会把它拆开。两者必须是兄弟
    expect(row.contains(button)).toBe(false);
    expect(button.closest("a")).toBeNull();
  });

  it("空列表给出管理员发布任务的说明", () => {
    setup([]);
    renderWithProviders(<MobileTaskCards baseId={3} />);
    expect(screen.getByText("这个知识库下还没有任务")).toBeInTheDocument();
    expect(screen.getByText("任务由知识库管理员发布。")).toBeInTheDocument();
  });

  it("加载失败展示错误并可重试", () => {
    vi.mocked(useTasksQuery).mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error("网络异常"),
      refetch: vi.fn(),
    } as never);
    renderWithProviders(<MobileTaskCards baseId={3} />);
    expect(screen.getByRole("alert")).toHaveTextContent("任务加载失败：网络异常");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("点提交打开底部提交面板（按需加载）", async () => {
    setup([{ id: 1, taskName: "读论文", submissionStatus: 0, endTime: FUTURE }]);
    vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: { id: 3, knowledgeBaseName: "我的库" },
    } as never);
    renderWithProviders(<MobileTaskCards baseId={3} />);

    fireEvent.click(screen.getByTestId("task-submit-1"));
    expect(
      await screen.findByTestId("submit-task-sheet", {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText("读论文 · 选一篇笔记作为成果")).toBeInTheDocument();
    // 知识库是只读行（后端强制同库，不能切换）
    expect(screen.getByText("知识库 · 任务所在库")).toBeInTheDocument();
  });
});
