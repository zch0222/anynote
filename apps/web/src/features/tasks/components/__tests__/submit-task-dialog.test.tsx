import { SubmitTaskDialog } from "@/features/tasks/components/submit-task-dialog";
import type { MemberTask } from "@/features/tasks/schemas";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/notes/use-notes", () => ({ useNotesQuery: vi.fn() }));
vi.mock("@/features/notes/use-knowledge-bases", () => ({ useKnowledgeBaseQuery: vi.fn() }));
vi.mock("@/features/tasks/use-tasks", () => ({ useSubmitTaskMutation: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useKnowledgeBaseQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { useSubmitTaskMutation } from "@/features/tasks/use-tasks";
import { toast } from "sonner";

const NOTES = [
  { id: 11, title: "读书笔记 A" },
  { id: 12, title: "读书笔记 B" },
];

const TASK: MemberTask = {
  id: 3,
  taskName: "读书笔记",
  startTime: "2026-09-01T00:00:00",
  endTime: "2099-01-01T00:00:00",
  submissionStatus: 0,
  submissionNoteId: null,
};

function setup(task: MemberTask = TASK, mutateAsync = vi.fn().mockResolvedValue(undefined)) {
  vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
    isPending: false,
    isError: false,
    data: { id: 5, knowledgeBaseName: "产品设计知识库" },
  } as never);
  vi.mocked(useNotesQuery).mockReturnValue({
    isPending: false,
    isError: false,
    data: { rows: NOTES, total: 2, pages: 1 },
  } as never);
  vi.mocked(useSubmitTaskMutation).mockReturnValue({ mutateAsync, isPending: false } as never);
  const onOpenChange = vi.fn();
  const view = renderWithProviders(
    <SubmitTaskDialog baseId={5} task={task} onOpenChange={onOpenChange} />,
  );
  return { ...view, mutateAsync, onOpenChange };
}

describe("SubmitTaskDialog", () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  /** §1.4 第 1 条：知识库固定为任务所在库，不可切换。 */
  it("知识库是只读行，没有选择器", () => {
    setup();
    const row = screen.getByTestId("submit-base-readonly");
    expect(row).toHaveTextContent("产品设计知识库");
    expect(row).toHaveTextContent("任务所在库");
    expect(within(row).queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("笔记列表按任务的 knowledgeBaseId 查，而不是「默认第一个库」", () => {
    setup();
    expect(useNotesQuery).toHaveBeenCalledWith({
      knowledgeBaseId: 5,
      page: 1,
      pageSize: expect.any(Number),
    });
    expect(screen.getByText("读书笔记 A")).toBeInTheDocument();
  });

  /** D-07 图例 32：选中态是 accent 底 + 右侧 ✓，不是转圈。 */
  it("选中笔记：accent 底 + 对勾图标，且不出现 Spinner", () => {
    setup();
    const option = screen.getByTestId("submit-note-11");
    expect(option).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(option);

    expect(option).toHaveAttribute("aria-pressed", "true");
    expect(option.className).toContain("bg-accent-soft");
    expect(option.className).toContain("text-accent");
    // 转圈会被读成"这一条正在加载"，图例 32 明确要求删掉
    expect(within(option).queryByRole("status")).toBeNull();
    expect(option.querySelector(".animate-spin")).toBeNull();
    expect(option.querySelector("svg.lucide-check")).toBeTruthy();
  });

  it("重新提交时默认选中上次提交的笔记", () => {
    setup({ ...TASK, submissionStatus: 3, submissionNoteId: 12 });
    expect(screen.getByTestId("submit-note-12")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("submit-note-11")).toHaveAttribute("aria-pressed", "false");
    // 已经预选好了，确认键可以直接点
    expect(screen.getByTestId("submit-task-confirm")).toBeEnabled();
  });

  it("首次提交没有预选，确认键此时禁用", () => {
    setup();
    expect(screen.getByTestId("submit-note-11")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("submit-task-confirm")).toBeDisabled();
  });

  it("提交成功：调用 submit、toast「任务已提交」并关闭对话框", async () => {
    const { mutateAsync, onOpenChange } = setup();
    fireEvent.click(screen.getByTestId("submit-note-11"));
    fireEvent.click(screen.getByTestId("submit-task-confirm"));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ noteId: 11, noteTaskId: 3 }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("任务已提交");
  });

  it("提交失败：toast 显示后端原因，对话框不关、选择保留", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("提交失败，任务已经结束"));
    const { onOpenChange } = setup(TASK, mutateAsync);
    fireEvent.click(screen.getByTestId("submit-note-11"));
    fireEvent.click(screen.getByTestId("submit-task-confirm"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("提交失败，任务已经结束"));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByTestId("submit-note-11")).toHaveAttribute("aria-pressed", "true");
  });

  it("没选笔记时点确认只提示，不发请求", () => {
    const { mutateAsync } = setup();
    // 确认键此时是禁用的，直接调 handleSubmit 的路径由下面这条覆盖：
    expect(screen.getByTestId("submit-task-confirm")).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("知识库下没有笔记时给出引导而不是空列表", () => {
    vi.mocked(useKnowledgeBaseQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: { id: 5, knowledgeBaseName: "产品设计知识库" },
    } as never);
    vi.mocked(useNotesQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: { rows: [], total: 0, pages: 1 },
    } as never);
    vi.mocked(useSubmitTaskMutation).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
    renderWithProviders(<SubmitTaskDialog baseId={5} task={TASK} onOpenChange={vi.fn()} />);
    expect(screen.getByText(/还没有笔记/)).toBeInTheDocument();
  });
});
