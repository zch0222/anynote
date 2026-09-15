import { TaskTable } from "@/features/tasks/components/task-table";
import type { MemberTask } from "@/features/tasks/schemas";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/notes/5/tasks",
}));

// 提交对话框自己会拉笔记列表与知识库，这里只关心它有没有被打开、带上了哪条任务
vi.mock("@/features/tasks/components/submit-task-dialog", () => ({
  SubmitTaskDialog: ({ task }: { task: { taskName?: string | null } }) => (
    <div data-testid="submit-dialog">提交任务「{task.taskName ?? "未命名任务"}」</div>
  ),
}));

const FUTURE = "2099-01-01T00:00:00";
const PAST = "2020-01-01T00:00:00";
const STARTED = "2026-09-01T00:00:00";

const TASKS: MemberTask[] = [
  {
    id: 1,
    taskName: "读书笔记",
    taskDescribe: "写一篇读后感",
    startTime: STARTED,
    endTime: FUTURE,
    submissionStatus: 0,
    submitTime: null,
    taskCreatorNickname: "林一",
  },
  {
    id: 2,
    taskName: "周报整理",
    taskDescribe: null,
    startTime: STARTED,
    endTime: FUTURE,
    submissionStatus: 1,
    submitTime: "2026-09-02T10:00:00",
    taskCreatorNickname: "林一",
  },
  {
    // 3 = 已退回，未截止 → 出「重新提交」
    id: 3,
    taskName: "被退回的任务",
    taskDescribe: null,
    startTime: STARTED,
    endTime: FUTURE,
    submissionStatus: 3,
    submitTime: null,
    taskCreatorNickname: "周宁",
  },
  {
    // 2 = 无需提交（本库管理员自己）：不出徽标、不出操作
    id: 4,
    taskName: "管理员自己的任务",
    taskDescribe: null,
    startTime: STARTED,
    endTime: FUTURE,
    submissionStatus: 2,
    submitTime: null,
    taskCreatorNickname: "我",
  },
  {
    // 未提交但已截止 → 灰字「已截止」
    id: 5,
    taskName: "过期任务",
    taskDescribe: null,
    startTime: STARTED,
    endTime: PAST,
    submissionStatus: 0,
    submitTime: null,
    taskCreatorNickname: "林一",
  },
  {
    // 未开始 → 操作列留空
    id: 6,
    taskName: "还没开始的任务",
    taskDescribe: null,
    startTime: FUTURE,
    endTime: FUTURE,
    submissionStatus: 0,
    submitTime: null,
    taskCreatorNickname: "林一",
  },
];

function render(tasks: MemberTask[] = TASKS, baseId = 5) {
  return renderWithProviders(<TaskTable baseId={baseId} tasks={tasks} loading={false} />);
}

describe("TaskTable", () => {
  it("渲染全部任务行，名称下显示发布人", () => {
    render();
    expect(screen.getByTestId("task-row-1")).toBeInTheDocument();
    expect(screen.getByText("读书笔记")).toBeInTheDocument();
    expect(screen.getAllByText("林一 发布").length).toBeGreaterThan(0);
    expect(screen.getByText("周宁 发布")).toBeInTheDocument();
  });

  /** D-07 图例 10：整行可点，但要用链接保证键盘可达。 */
  it("整行可点：名称单元格是 Link，指向任务详情", () => {
    render();
    const link = within(screen.getByTestId("task-row-1")).getByRole("link", {
      name: /读书笔记/,
    });
    expect(link).toHaveAttribute("href", "/notes/5/tasks/1");
    // 扩大命中区的那层伪元素：漏掉它整行就只剩标题几个字能点
    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");
  });

  /** §1.4 第 2 条：0 warning / 1 success / 3 danger。 */
  it("状态徽标变体：未提交 warning、已提交 success、已退回 destructive", () => {
    render();
    const variantOf = (rowId: number) =>
      within(screen.getByTestId(`task-row-${rowId}`))
        .getByTestId("task-status")
        .getAttribute("data-variant");

    expect(variantOf(1)).toBe("warning");
    expect(variantOf(2)).toBe("success");
    expect(variantOf(3)).toBe("destructive");
  });

  it("status = 2（无需提交）的行没有徽标也没有操作", () => {
    render();
    const row = within(screen.getByTestId("task-row-4"));
    expect(row.queryByTestId("task-status")).toBeNull();
    expect(row.queryByTestId("task-submit-4")).toBeNull();
    expect(row.queryByTestId("task-resubmit-4")).toBeNull();
    expect(row.queryByTestId("task-view-4")).toBeNull();
  });

  /**
   * 操作列真值表：
   *   canSubmit      → 提交
   *   canResubmit    → 重新提交（只有已退回且未截止）
   *   status === 1   → accent 文字「查看」（§1.4 第 3 条：已提交不出提交类按钮）
   *   截止后         → 灰字「已截止」
   *   其余（未开始 / 无需提交）→ 留空
   */
  it("操作列真值表：提交 / 重新提交 / 查看 / 已截止 / 留空", () => {
    render();

    // 1 未提交 + 进行中 → 提交
    expect(screen.getByTestId("task-submit-1")).toHaveTextContent("提交");

    // 2 已提交 + 进行中 → 查看（且**没有**任何提交类按钮）
    expect(screen.getByTestId("task-view-2")).toHaveTextContent("查看");
    expect(screen.getByTestId("task-view-2")).toHaveAttribute("href", "/notes/5/tasks/2");
    expect(screen.queryByTestId("task-submit-2")).toBeNull();
    expect(screen.queryByTestId("task-resubmit-2")).toBeNull();

    // 3 已退回 + 进行中 → 重新提交
    expect(screen.getByTestId("task-resubmit-3")).toHaveTextContent("重新提交");

    // 5 未提交但已截止 → 灰字「已截止」
    expect(within(screen.getByTestId("task-row-5")).getByText("已截止")).toBeInTheDocument();
    expect(screen.queryByTestId("task-submit-5")).toBeNull();

    // 6 未开始 → 操作列留空
    expect(screen.queryByTestId("task-submit-6")).toBeNull();
    expect(screen.queryByTestId("task-resubmit-6")).toBeNull();
    expect(screen.queryByTestId("task-view-6")).toBeNull();
  });

  it("点「提交」打开对话框并带上是哪一条任务", async () => {
    render();
    fireEvent.click(screen.getByTestId("task-submit-1"));
    expect(await screen.findByTestId("submit-dialog")).toHaveTextContent("读书笔记");
  });

  it("点「重新提交」同样打开对话框", async () => {
    render();
    fireEvent.click(screen.getByTestId("task-resubmit-3"));
    expect(await screen.findByTestId("submit-dialog")).toHaveTextContent("被退回的任务");
  });

  it("空数据展示画板空态文案", () => {
    render([]);
    expect(screen.getByText("这个知识库下还没有任务")).toBeInTheDocument();
  });

  it("加载态渲染骨架", () => {
    const { container } = renderWithProviders(<TaskTable baseId={5} tasks={[]} loading />);
    expect(container.querySelector('[data-slot="skeleton-table"]')).toBeTruthy();
    expect(screen.queryByTestId("task-table")).toBeNull();
  });

  it("任务名为空时显示「未命名任务」", () => {
    render([{ id: 7, taskName: "  ", startTime: STARTED, endTime: FUTURE, submissionStatus: 0 }]);
    expect(screen.getByText("未命名任务")).toBeInTheDocument();
  });
});
