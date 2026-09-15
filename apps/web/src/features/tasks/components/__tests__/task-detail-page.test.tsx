import { TaskDetailPage } from "@/features/tasks/components/task-detail-page";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/notes/5/tasks/9",
}));
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: vi.fn(),
}));
vi.mock("@/features/notes/use-note", () => ({ useNoteQuery: vi.fn() }));
vi.mock("@/features/tasks/use-task-detail", () => ({
  useAdminTaskQuery: vi.fn(),
  useMemberTaskQuery: vi.fn(),
  useTaskSubmissionsQuery: vi.fn(),
  useTaskHeatmapQuery: vi.fn(),
  useTaskTimelineQuery: vi.fn(),
  isTaskMissing: vi.fn(),
  isHeatmapUnavailable: vi.fn(() => true),
}));
vi.mock("@/features/tasks/use-task-mutations", () => ({
  useReturnSubmissionMutation: vi.fn(),
  useCreateTaskMutation: vi.fn(),
  useUpdateTaskMutation: vi.fn(),
}));
vi.mock("@/features/tasks/components/task-heatmap", () => ({
  TaskHeatmap: ({ taskId }: { taskId: number }) => (
    <div data-testid="heatmap-stub">heatmap {taskId}</div>
  ),
}));
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value }: { value: string }) => <div data-testid="readonly-editor">{value}</div>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNoteQuery } from "@/features/notes/use-note";
import {
  isTaskMissing,
  useAdminTaskQuery,
  useMemberTaskQuery,
  useTaskSubmissionsQuery,
  useTaskTimelineQuery,
} from "@/features/tasks/use-task-detail";
import { useReturnSubmissionMutation } from "@/features/tasks/use-task-mutations";
import { toast } from "sonner";

const IDLE = { isPending: false, isError: false, isFetching: false, refetch: vi.fn() };

const ADMIN_TASK = {
  id: 9,
  taskName: "读书笔记",
  taskDescribe: "## 写一篇读后感",
  startTime: "2026-09-10T10:00:00",
  endTime: "2099-09-18T23:59:00",
  knowledgeBaseId: 5,
  needSubmitCount: 12,
  submittedCount: 8,
};

const SUBMISSION = {
  id: 31,
  noteId: 77,
  noteTaskId: 9,
  noteTitle: "林一的读书笔记",
  noteEditCount: 41,
  submissionNickname: "林一",
  submitTime: "2026-09-13T10:00:00",
};

function setupAdmin(overrides: { task?: Record<string, unknown> } = {}) {
  vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
    ...IDLE,
    data: { id: 5, knowledgeBaseName: "产品设计知识库", permissions: 1 },
  } as never);
  vi.mocked(useAdminTaskQuery).mockReturnValue({
    ...IDLE,
    data: { ...ADMIN_TASK, ...overrides.task },
  } as never);
  vi.mocked(useMemberTaskQuery).mockReturnValue({
    ...IDLE,
    data: { id: 9, taskCreatorNickname: "林一" },
  } as never);
  vi.mocked(useTaskSubmissionsQuery).mockReturnValue({
    ...IDLE,
    data: { rows: [SUBMISSION], total: 1, pages: 3, current: 1 },
  } as never);
}

describe("TaskDetailPage · 管理员视角", () => {
  beforeEach(() => {
    vi.mocked(useAdminTaskQuery).mockReset();
    vi.mocked(useTaskSubmissionsQuery).mockReset();
    vi.mocked(useReturnSubmissionMutation).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    } as never);
    vi.mocked(isTaskMissing).mockReturnValue(false);
  });

  it("渲染页头、统计卡与发布人 / 时间窗口", () => {
    setupAdmin();
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    expect(screen.getByTestId("task-detail-admin")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "读书笔记" })).toBeInTheDocument();
    expect(screen.getByTestId("task-phase")).toHaveTextContent("进行中");
    expect(screen.getByText(/林一 发布/)).toBeInTheDocument();
    expect(screen.getByText(/09-10 10:00 – 09-18 23:59/)).toBeInTheDocument();

    // 统计卡：完成率是 submitted / need 现算，不是后端的 submissionProgress
    expect(screen.getByTestId("task-need")).toHaveTextContent("12");
    expect(screen.getByTestId("task-submitted")).toHaveTextContent("8");
    expect(screen.getByTestId("task-rate")).toHaveTextContent("67%");

    // 编辑任务入口
    expect(screen.getByTestId("task-edit")).toHaveAttribute("href", "/notes/5/tasks/9/edit");
  });

  it("描述为空时整卡隐藏", () => {
    setupAdmin({ task: { taskDescribe: "   " } });
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.queryByTestId("task-describe")).toBeNull();
  });

  it("提交行整行可点到任务所在库的笔记地址", () => {
    setupAdmin();
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.getByRole("link", { name: "林一的读书笔记" })).toHaveAttribute(
      "href",
      "/notes/5/77",
    );
    // 图例 13：提交人 · 时间 · 编辑次数，用绝对时刻好逐行比对
    expect(screen.getByText("林一 · 09-13 10:00 提交 · 编辑 41 次")).toBeInTheDocument();
  });

  /**
   * 图例 11：三个 tab 对应 userTaskStatus = 1 / 0 / 3，且**三条查询并行**取各自计数。
   * 只有当前 tab 跟 `page` 走，另外两条固定第 1 页（它们只为 `total` 而存在）。
   */
  it("三个 tab 并行查询（顺序提交 / 未提交 / 已退回）", () => {
    setupAdmin();
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    expect(vi.mocked(useTaskSubmissionsQuery)).toHaveBeenCalledWith(9, "submitted", 1);
    expect(vi.mocked(useTaskSubmissionsQuery)).toHaveBeenCalledWith(9, "pending", 1);
    expect(vi.mocked(useTaskSubmissionsQuery)).toHaveBeenCalledWith(9, "returned", 1);

    fireEvent.click(screen.getByRole("radio", { name: /已退回/ }));
    expect(vi.mocked(useTaskSubmissionsQuery)).toHaveBeenCalledWith(9, "returned", 1);
  });

  it("tab 上显示各自查询的 total 计数", () => {
    const totals: Record<string, number> = { submitted: 8, pending: 3, returned: 1 };
    setupAdmin();
    // setupAdmin 先铺默认桩，这里再按 tab 分派 total（顺序不能反）
    vi.mocked(useTaskSubmissionsQuery).mockImplementation(
      ((taskId: number, tab: string) =>
        ({
          ...IDLE,
          data: { rows: [], total: totals[tab] ?? 0, pages: 1, current: 1 },
        }) as never) as never,
    );
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    expect(screen.getByRole("radio", { name: "已提交 8" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "未提交 3" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "已退回 1" })).toBeInTheDocument();
  });

  it("切 tab 时回到第一页，且只有当前 tab 跟着翻页", async () => {
    setupAdmin();
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await waitFor(() =>
      expect(vi.mocked(useTaskSubmissionsQuery)).toHaveBeenCalledWith(9, "submitted", 2),
    );
    // 另外两条仍停在第 1 页
    expect(vi.mocked(useTaskSubmissionsQuery)).toHaveBeenCalledWith(9, "pending", 1);
    expect(vi.mocked(useTaskSubmissionsQuery)).toHaveBeenCalledWith(9, "returned", 1);

    fireEvent.click(screen.getByRole("radio", { name: /未提交/ }));
    await waitFor(() =>
      expect(vi.mocked(useTaskSubmissionsQuery)).toHaveBeenCalledWith(9, "pending", 1),
    );
  });

  /** 图例 15 / 24–27：退回走确认对话框，danger 语气 + 写清后果与截止时间。 */
  it("退回流程：打开确认对话框 → 确认 → toast「已退回」并关闭", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useReturnSubmissionMutation).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never);
    setupAdmin();
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    fireEvent.click(screen.getByTestId("submission-menu-31"));
    fireEvent.click(await screen.findByTestId("submission-return-31"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("退回这份提交？");
    expect(dialog).toHaveTextContent(
      "林一 的提交会变成「已退回」，TA 可以在 09-18 23:59 之前重新提交。",
    );

    fireEvent.click(screen.getByRole("button", { name: "退回" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(31));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("已退回"));
  });

  it("已截止时退回文案改成「TA 将无法重新提交」", async () => {
    setupAdmin({ task: { endTime: "2020-01-01T00:00:00" } });
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    expect(screen.getByTestId("task-phase")).toHaveTextContent("已截止");
    // 已截止的任务不再出「编辑」之外的提交类操作，但退回仍可用
    fireEvent.click(screen.getByTestId("submission-menu-31"));
    fireEvent.click(await screen.findByTestId("submission-return-31"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("任务已截止，退回后 TA 将无法重新提交。");
  });

  it("「未提交」tab 的行不可点，也没有行菜单", async () => {
    setupAdmin();
    vi.mocked(useTaskSubmissionsQuery).mockReturnValue({
      ...IDLE,
      data: {
        rows: [{ id: 41, submissionNickname: "周宁", submissionUsername: "zhou" }],
        total: 1,
        pages: 1,
        current: 1,
      },
    } as never);
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    fireEvent.click(screen.getByRole("radio", { name: /未提交/ }));
    await waitFor(() => expect(screen.getByTestId("submission-row-41")).toBeInTheDocument());
    // 图例 12：「未提交」列表只有昵称 + 用户名
    expect(screen.getByText("周宁")).toBeInTheDocument();
    expect(screen.getByText("zhou")).toBeInTheDocument();
    expect(screen.queryByTestId("submission-menu-41")).toBeNull();
    expect(screen.queryByRole("link", { name: /周宁/ })).toBeNull();
  });

  /** 图例 22 / 23：查不到（或无权限）时给不存在态，回任务 Tab。 */
  it("不存在 / 无权限：显示 NotFoundState 并回任务 Tab", () => {
    vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
      ...IDLE,
      data: { id: 5, permissions: 1 },
    } as never);
    vi.mocked(isTaskMissing).mockReturnValue(true);
    vi.mocked(useAdminTaskQuery).mockReturnValue({
      ...IDLE,
      isError: true,
      error: new ApiError(200, "A0301", "没有权限查看笔记任务信息"),
    } as never);
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    expect(screen.getByText("找不到这个任务")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到任务" })).toHaveAttribute(
      "href",
      "/notes/5/tasks",
    );
  });

  it("其它错误走可重试的 QueryError", () => {
    const refetch = vi.fn();
    vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
      ...IDLE,
      data: { id: 5, permissions: 1 },
    } as never);
    vi.mocked(useAdminTaskQuery).mockReturnValue({
      ...IDLE,
      isError: true,
      error: new Error("网络异常"),
      refetch,
    } as never);
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    expect(screen.getByRole("alert")).toHaveTextContent("任务加载失败：网络异常");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("热力图挂在详情页里", () => {
    setupAdmin();
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.getByTestId("heatmap-stub")).toHaveTextContent("heatmap 9");
  });
});

describe("TaskDetailPage · 成员视角", () => {
  beforeEach(() => {
    vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
      ...IDLE,
      data: { id: 5, knowledgeBaseName: "产品设计知识库", permissions: 2 },
    } as never);
    vi.mocked(useTaskTimelineQuery).mockReturnValue({
      ...IDLE,
      data: [
        { id: 3, type: 4, operationTime: "2026-09-12T09:00:00" },
        { id: 2, type: 3, operationTime: "2026-09-10T09:00:00", noteHistoryTitle: "读书笔记" },
      ],
    } as never);
    vi.mocked(useNoteQuery).mockReturnValue({
      ...IDLE,
      data: { id: 77, title: "我的读书笔记" },
    } as never);
  });

  function setupMember(task: Record<string, unknown>) {
    vi.mocked(useMemberTaskQuery).mockReturnValue({
      ...IDLE,
      data: { id: 9, taskName: "读书笔记", startTime: "2026-09-01T00:00:00", ...task },
    } as never);
  }

  it("未提交且进行中 → 主按钮「提交」", () => {
    setupMember({ submissionStatus: 0, endTime: "2099-01-01T00:00:00" });
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.getByTestId("member-action")).toHaveTextContent("提交");
    expect(screen.getByTestId("member-action")).toBeEnabled();
  });

  it("已退回且进行中 → 主按钮「重新提交」", () => {
    setupMember({ submissionStatus: 3, endTime: "2099-01-01T00:00:00" });
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.getByTestId("member-action")).toHaveTextContent("重新提交");
    expect(screen.getByTestId("member-action")).toBeEnabled();
  });

  /** §1.4 第 3 条：已提交不再出提交类按钮。 */
  it("已提交 → 主按钮「已提交」且禁用", () => {
    setupMember({ submissionStatus: 1, endTime: "2099-01-01T00:00:00" });
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.getByTestId("member-action")).toHaveTextContent("已提交");
    expect(screen.getByTestId("member-action")).toBeDisabled();
  });

  it("已截止 → 主按钮「已截止」且禁用", () => {
    setupMember({ submissionStatus: 0, endTime: "2020-01-01T00:00:00" });
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.getByTestId("member-action")).toHaveTextContent("已截止");
    expect(screen.getByTestId("member-action")).toBeDisabled();
  });

  it("查不到任务 → 不存在态", () => {
    vi.mocked(useMemberTaskQuery).mockReturnValue({ ...IDLE, data: null } as never);
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.getByText("找不到这个任务")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到任务" })).toHaveAttribute(
      "href",
      "/notes/5/tasks",
    );
  });

  it("时间线只显示提交与退回，且取笔记标题用 submissionNoteId", () => {
    setupMember({
      submissionStatus: 1,
      endTime: "2099-01-01T00:00:00",
      submissionNoteId: 77,
    });
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);

    expect(screen.getByText("提交了任务")).toBeInTheDocument();
    expect(screen.getByText("提交被退回")).toBeInTheDocument();
    expect(useNoteQuery).toHaveBeenCalledWith(77);
    expect(screen.getByTestId("my-submission-note")).toHaveTextContent("我的读书笔记");
    expect(screen.getByTestId("my-submission-note")).toHaveAttribute("href", "/notes/5/77");
  });

  it("没有提交笔记时不渲染「我的提交」行，也不查笔记", () => {
    setupMember({ submissionStatus: 0, endTime: "2099-01-01T00:00:00", submissionNoteId: null });
    vi.mocked(useNoteQuery).mockClear();
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.queryByTestId("my-submission-note")).toBeNull();
    expect(useNoteQuery).toHaveBeenCalledWith(0);
  });

  it("成员视角不渲染统计卡、提交记录与编辑入口", () => {
    setupMember({ submissionStatus: 0, endTime: "2099-01-01T00:00:00" });
    renderWithProviders(<TaskDetailPage baseId={5} taskId={9} />);
    expect(screen.getByTestId("task-detail-member")).toBeInTheDocument();
    expect(screen.queryByTestId("task-need")).toBeNull();
    expect(screen.queryByTestId("task-edit")).toBeNull();
    expect(screen.queryByTestId("submission-list")).toBeNull();
  });
});
