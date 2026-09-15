import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/notes/3/tasks/9",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: vi.fn(),
  useKnowledgeBasesQuery: vi.fn(() => ({ isPending: false, isError: false, data: [] })),
}));
vi.mock("@/features/notes/use-notes", () => ({
  useNotesQuery: vi.fn(() => ({ isPending: false, isError: false, data: { rows: [] } })),
}));
vi.mock("@/features/notes/use-note", () => ({
  useNoteQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: { id: 42, title: "我的笔记", updateTime: "2026-09-12T10:00:00" },
  })),
}));
vi.mock("@/features/tasks/use-tasks", () => ({
  useSubmitTaskMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock("@/features/tasks/use-task-detail", () => ({
  useMemberTaskQuery: vi.fn(),
  useAdminTaskQuery: vi.fn(),
  useTaskSubmissionsQuery: vi.fn(),
  useTaskTimelineQuery: vi.fn(),
  isTaskMissing: vi.fn(() => false),
}));
vi.mock("@/features/tasks/use-task-mutations", () => ({
  useReturnSubmissionMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { MobileTaskDetail } from "@/features/tasks/components/mobile/task-detail-mobile";
import {
  useAdminTaskQuery,
  useMemberTaskQuery,
  useTaskSubmissionsQuery,
  useTaskTimelineQuery,
} from "@/features/tasks/use-task-detail";
import { useReturnSubmissionMutation } from "@/features/tasks/use-task-mutations";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false, isFetching: false };
const FUTURE = "2099-01-01T00:00:00";
const SOON = "2030-01-01T00:00:00";
const PAST = "2020-01-01T00:00:00";

function mockBase(permissions: number) {
  vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
    ...IDLE,
    data: { id: 3, knowledgeBaseName: "我的库", permissions },
  } as never);
}

function mockMemberTask(task: Record<string, unknown> | null) {
  vi.mocked(useMemberTaskQuery).mockReturnValue({ ...IDLE, data: task } as never);
}

function mockTimeline(rows: Array<Record<string, unknown>> = []) {
  vi.mocked(useTaskTimelineQuery).mockReturnValue({ ...IDLE, data: rows } as never);
}

function mockAdminTask(task: Record<string, unknown> | null) {
  vi.mocked(useAdminTaskQuery).mockReturnValue({ ...IDLE, data: task } as never);
}

function mockSubmissions(rows: Array<Record<string, unknown>> = [], pages = 1) {
  vi.mocked(useTaskSubmissionsQuery).mockReturnValue({
    ...IDLE,
    data: { rows, pages, total: rows.length, current: 1 },
  } as never);
}

describe("MobileTaskDetail · 成员视角", () => {
  it("展示任务名、状态、时间窗口与描述", () => {
    mockBase(3);
    mockMemberTask({
      id: 9,
      taskName: "读书笔记",
      taskDescribe: "写一篇 800 字",
      submissionStatus: 0,
      startTime: "2026-09-05T10:00:00",
      endTime: FUTURE,
      taskCreatorNickname: "陈可",
    });
    mockTimeline();
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.getByTestId("task-detail-name")).toHaveTextContent("读书笔记");
    expect(screen.getByText("未提交")).toBeInTheDocument();
    expect(screen.getByTestId("task-detail-describe")).toHaveTextContent("写一篇 800 字");
    expect(screen.getByText("陈可 发布")).toBeInTheDocument();
  });

  it("描述为空时整段隐藏", () => {
    mockBase(3);
    mockMemberTask({ id: 9, taskName: "无描述", submissionStatus: 0, endTime: FUTURE });
    mockTimeline();
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.queryByTestId("task-detail-describe")).toBeNull();
  });

  it("截止后显示「已截止」，主按钮禁用", () => {
    mockBase(3);
    mockMemberTask({ id: 9, taskName: "过期", submissionStatus: 0, endTime: PAST });
    mockTimeline();
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.getByTestId("task-days-left")).toHaveTextContent("已截止");
    expect(screen.getByTestId("task-detail-primary")).toBeDisabled();
    expect(screen.getByTestId("task-detail-primary")).toHaveTextContent("已截止");
  });

  it("剩余 ≤3 天时转 warning", () => {
    mockBase(3);
    // 明天截止：剩余 1 天
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    mockMemberTask({ id: 9, taskName: "快到了", submissionStatus: 0, endTime: tomorrow });
    mockTimeline();
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.getByTestId("task-days-left")).toHaveClass("text-warning");
  });

  it("主按钮四态：未提交「提交」/ 已退回「重新提交」/ 已提交禁用 / 截止禁用", () => {
    mockBase(3);
    mockTimeline();

    mockMemberTask({ id: 9, taskName: "A", submissionStatus: 0, endTime: FUTURE });
    const first = renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);
    expect(screen.getByTestId("task-detail-primary")).toHaveTextContent("提交");
    expect(screen.getByTestId("task-detail-primary")).toBeEnabled();
    first.unmount();

    mockMemberTask({ id: 9, taskName: "A", submissionStatus: 3, endTime: FUTURE });
    const second = renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);
    expect(screen.getByTestId("task-detail-primary")).toHaveTextContent("重新提交");
    expect(screen.getByTestId("task-detail-primary")).toBeEnabled();
    second.unmount();

    mockMemberTask({ id: 9, taskName: "A", submissionStatus: 1, endTime: FUTURE });
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);
    expect(screen.getByTestId("task-detail-primary")).toBeDisabled();
    expect(screen.getByTestId("task-detail-primary")).toHaveTextContent("已提交");
  });

  it("未开始时不能提交（后端也会拒）", () => {
    mockBase(3);
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const later = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    mockMemberTask({
      id: 9,
      taskName: "A",
      submissionStatus: 0,
      startTime: future,
      endTime: later,
    });
    mockTimeline();
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.getByTestId("task-detail-primary")).toBeDisabled();
    expect(screen.getByTestId("task-detail-primary")).toHaveTextContent("已提交");
  });

  it("「我的提交」笔记行指向笔记编辑器", () => {
    mockBase(3);
    mockMemberTask({
      id: 9,
      taskName: "A",
      submissionStatus: 1,
      endTime: FUTURE,
      submissionNoteId: 42,
    });
    mockTimeline();
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.getByTestId("task-submission-note")).toHaveAttribute("href", "/m/notes/3/42");
  });

  it("提交历史只渲染时间线事件，新的在上（顺序由 hook 保证）", () => {
    mockBase(3);
    mockMemberTask({ id: 9, taskName: "A", submissionStatus: 3, endTime: FUTURE });
    mockTimeline([
      { id: 2, type: 4, operationTime: "2026-09-13T10:00:00" },
      { id: 1, type: 3, operationTime: "2026-09-12T10:00:00", noteHistoryTitle: "初稿" },
    ]);
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    const list = screen.getByTestId("task-timeline");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("被退回");
    expect(items[1]).toHaveTextContent("已提交 · 初稿");
  });

  it("找不到任务时显示不存在态（同 D-17）", () => {
    mockBase(3);
    mockMemberTask(null);
    mockTimeline();
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.getByText("找不到这个任务")).toBeInTheDocument();
    expect(screen.getByText("它可能已被删除，或者你还没有访问权限。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到任务" })).toHaveAttribute(
      "href",
      "/m/notes/3/tasks",
    );
  });
});

describe("MobileTaskDetail · 管理员视角", () => {
  it("permissions === 1 时渲染进度统计与分段列表，不出编辑入口", () => {
    mockBase(1);
    mockAdminTask({
      id: 9,
      taskName: "读书笔记",
      startTime: "2026-09-05T10:00:00",
      endTime: FUTURE,
      needSubmitCount: 12,
      submittedCount: 8,
    });
    mockSubmissions([]);
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.getByTestId("mobile-task-detail-admin")).toBeInTheDocument();
    expect(screen.getByTestId("task-progress")).toHaveTextContent("8 / 12 人已提交");
    expect(screen.getByRole("progressbar", { name: "提交进度" })).toHaveAttribute(
      "aria-valuenow",
      "67",
    );
    expect(screen.getByRole("radiogroup", { name: "提交记录筛选" })).toBeInTheDocument();
    expect(screen.getByText("编辑任务、查看编辑活跃度请使用桌面版。")).toBeInTheDocument();
    // 移动端不提供编辑任务入口
    expect(screen.queryByRole("link", { name: /编辑任务/ })).toBeNull();
  });

  it("提交行指向笔记，行尾「⋯」打开动作表", () => {
    mockBase(1);
    mockAdminTask({
      id: 9,
      taskName: "读书笔记",
      endTime: FUTURE,
      needSubmitCount: 2,
      submittedCount: 1,
    });
    mockSubmissions([
      {
        id: 5,
        noteId: 42,
        noteTitle: "初稿",
        submissionNickname: "林一",
        submitTime: "2026-09-12T14:30:00",
        status: 0,
      },
    ]);
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.getByTestId("submission-row-5")).toHaveAttribute("href", "/m/notes/3/42");
    fireEvent.click(screen.getByTestId("submission-actions-5"));
    expect(screen.getByTestId("mobile-action-sheet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退回" })).toBeInTheDocument();
  });

  it("退回需要连点两次（第一次只换成确认文案）", () => {
    const mutateAsync = vi.fn(async () => undefined);
    vi.mocked(useReturnSubmissionMutation).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
    mockBase(1);
    mockAdminTask({ id: 9, taskName: "A", endTime: FUTURE });
    mockSubmissions([
      {
        id: 5,
        noteId: 42,
        noteTitle: "初稿",
        submissionNickname: "林一",
        submitTime: "2026-09-12T14:30:00",
        status: 0,
      },
    ]);
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    fireEvent.click(screen.getByTestId("submission-actions-5"));
    fireEvent.click(screen.getByRole("button", { name: "退回" }));
    // 第一次点击不执行
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "再点一次确认退回" }));
    expect(mutateAsync).toHaveBeenCalledWith(5);
  });

  it("「未提交」的行没有可打开的笔记，也没有退回入口", () => {
    mockBase(1);
    mockAdminTask({ id: 9, taskName: "A", endTime: FUTURE });
    mockSubmissions([
      {
        id: 6,
        noteId: null,
        noteTitle: null,
        submissionUsername: "小王",
        submitTime: null,
        status: null,
      },
    ]);
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    expect(screen.queryByTestId("submission-row-6")).toBeNull();
    expect(screen.getByText("小王")).toBeInTheDocument();
    expect(screen.queryByTestId("submission-actions-6")).toBeNull();
  });

  it("切换分段会请求对应的 userTaskStatus", () => {
    mockBase(1);
    mockAdminTask({ id: 9, taskName: "A", endTime: FUTURE });
    mockSubmissions([]);
    renderWithProviders(<MobileTaskDetail baseId={3} taskId={9} />);

    fireEvent.click(screen.getByRole("radio", { name: "已退回" }));
    expect(vi.mocked(useTaskSubmissionsQuery).mock.lastCall?.[1]).toBe("returned");
  });
});
