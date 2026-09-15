import { TasksPage } from "@/features/tasks/components/tasks-page";
import type { MemberTask } from "@/features/tasks/schemas";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/notes/5/tasks",
}));
vi.mock("@/features/tasks/use-tasks", () => ({
  useTasksQuery: vi.fn(),
  useSubmitTaskMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: vi.fn(),
}));
vi.mock("@/features/notes/use-notes", () => ({
  useNotesQuery: vi.fn(() => ({ isPending: false, isError: false, data: { rows: [] } })),
}));

import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useTasksQuery } from "@/features/tasks/use-tasks";

const FUTURE = "2099-01-01T00:00:00";
const STARTED = "2026-09-01T00:00:00";

const TASKS: MemberTask[] = [
  { id: 1, taskName: "未交的", startTime: STARTED, endTime: FUTURE, submissionStatus: 0 },
  { id: 2, taskName: "已交的", startTime: STARTED, endTime: FUTURE, submissionStatus: 1 },
  { id: 3, taskName: "被退回的", startTime: STARTED, endTime: FUTURE, submissionStatus: 3 },
  { id: 4, taskName: "管理员的", startTime: STARTED, endTime: FUTURE, submissionStatus: 2 },
];

function setup(
  options: {
    tasks?: MemberTask[];
    permissions?: number;
    tasksError?: Error | null;
    pending?: boolean;
  } = {},
) {
  const { tasks = TASKS, permissions = 2, tasksError = null, pending = false } = options;
  vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
    isPending: false,
    isError: false,
    data: { id: 5, knowledgeBaseName: "产品设计知识库", permissions },
  } as never);
  vi.mocked(useTasksQuery).mockReturnValue(
    (tasksError
      ? { isPending: false, isError: true, error: tasksError, refetch: vi.fn(), isFetching: false }
      : {
          isPending: pending,
          isError: false,
          data: { rows: tasks, total: tasks.length, pages: 1 },
          refetch: vi.fn(),
          isFetching: false,
        }) as never,
  );
  return renderWithProviders(<TasksPage baseId={5} />);
}

describe("TasksPage", () => {
  beforeEach(() => {
    vi.mocked(useTasksQuery).mockReset();
  });

  /** 页头副标题「N 个任务 · M 个待你提交」，M 只数能提交 / 能重新提交的行。 */
  it("页头副标题是「N 个任务 · M 个待你提交」", () => {
    setup();
    // 4 条里：未提交可提交 + 已退回可重新提交 = 2 条待办；已提交与无需提交不算
    expect(screen.getByText("4 个任务 · 2 个待你提交")).toBeInTheDocument();
  });

  it("管理员（permissions === 1）看到「新建任务」，指向本库新建页", () => {
    setup({ permissions: 1 });
    const link = screen.getByTestId("task-create");
    expect(link).toHaveAttribute("href", "/notes/5/tasks/new");
  });

  it("成员看不到新建入口，改看到「任务由知识库管理员发布」", () => {
    setup({ permissions: 2 });
    expect(screen.queryByTestId("task-create")).toBeNull();
    expect(screen.getByText("任务由知识库管理员发布")).toBeInTheDocument();
  });

  it("状态筛选是本地过滤，且每项带计数", () => {
    setup();
    // 计数：全部 4 / 未提交 1 / 已退回 1 / 已提交 1
    expect(screen.getByRole("radio", { name: "全部 4" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "未提交 1" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "已退回 1" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "已提交 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "已退回 1" }));
    expect(screen.getByTestId("task-row-3")).toBeInTheDocument();
    expect(screen.queryByTestId("task-row-1")).toBeNull();
    expect(screen.queryByTestId("task-row-2")).toBeNull();
  });

  /** 筛选后没有结果时给 EmptyState +「查看全部」，而不是一张空表。 */
  it("筛选无结果时显示空态与「查看全部」，点了回到全部", async () => {
    setup({
      tasks: [
        { id: 1, taskName: "未交的", startTime: STARTED, endTime: FUTURE, submissionStatus: 0 },
      ],
    });
    fireEvent.click(screen.getByRole("radio", { name: "已退回 0" }));

    expect(screen.getByText("没有已退回的任务")).toBeInTheDocument();
    expect(screen.queryByTestId("task-table")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "查看全部" }));
    await waitFor(() => expect(screen.getByTestId("task-row-1")).toBeInTheDocument());
  });

  it("整库没有任务时显示画板空态", () => {
    setup({ tasks: [] });
    expect(screen.getByText("这个知识库下还没有任务")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("加载失败显示可重试的错误态", () => {
    setup({ tasksError: new Error("网络异常") });
    expect(screen.getByRole("alert")).toHaveTextContent("任务加载失败：网络异常");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("加载中不显示筛选与表格", () => {
    setup({ pending: true });
    expect(screen.queryByTestId("task-table")).toBeNull();
    expect(screen.getByText("正在加载任务…")).toBeInTheDocument();
  });
});
