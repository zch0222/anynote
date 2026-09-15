import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `next/navigation` 打桩：`TaskFormPage` 的出口只有 push / replace，
 * 断言这两个就够覆盖「跳详情 / 非管理员回任务 Tab / 放弃修改后离开」。
 */
const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

/**
 * TipTap 在 jsdom 里要跑一整条 ProseMirror 管线（还有 Shiki / KaTeX 桥接），
 * 单测里既慢又和这些用例要验的东西无关。换成一个 textarea，
 * 让「任务描述」也能被 fireEvent 改到，从而断言它进了 payload。
 */
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({
    value,
    onChange,
    editable,
    placeholder,
  }: {
    value: string;
    onChange?: (markdown: string) => void;
    editable?: boolean;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="task-describe"
      value={value}
      placeholder={placeholder}
      disabled={editable === false}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

const createMutate = vi.fn();
const updateMutate = vi.fn();
/**
 * `isPending` 要能被用例推动：图例 15「提交中表单只读」只有在请求飞行时才成立，
 * 固定 `false` 的话那条分支永远测不到。
 */
const createPending = { value: false };
const updatePending = { value: false };
vi.mock("@/features/tasks/use-task-mutations", () => ({
  useCreateTaskMutation: () => ({
    mutateAsync: createMutate,
    get isPending() {
      return createPending.value;
    },
  }),
  useUpdateTaskMutation: () => ({
    mutateAsync: updateMutate,
    get isPending() {
      return updatePending.value;
    },
  }),
}));

const adminTask = vi.fn();
vi.mock("@/features/tasks/use-task-detail", () => ({
  useAdminTaskQuery: (taskId: number) => adminTask(taskId),
}));

const baseQuery = vi.fn();
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: (baseId: number) => baseQuery(baseId),
}));

import { TaskFormPage } from "@/features/tasks/components/task-form-page";
import { renderWithProviders } from "@/test/render";
import { toast } from "sonner";

/** 固定「现在」：2026-09-10 10:23（周四）。 */
const NOW = new Date("2026-09-10T10:23:00");
/** `defaultStartTime` = 下一个整点 = 11:00；默认截止 = +7 天的 23:59。 */
const START_TEXT = "09-10 11:00";
const DEFAULT_END_TEXT = "09-17 23:59";
/** 2 周胶囊 = 开始日 + 14 天 23:59。 */
const TWO_WEEK_END_TEXT = "09-24 23:59";

const IDLE = { isPending: false, isError: false };

function mockBase(permissions: number | null = 1) {
  baseQuery.mockReturnValue({
    ...IDLE,
    data: { id: 7, knowledgeBaseName: "产品设计知识库", permissions },
  });
}

function mockAdminTask(overrides: Record<string, unknown> = {}) {
  adminTask.mockReturnValue({
    ...IDLE,
    data: {
      id: 42,
      taskName: "读论文",
      taskDescribe: "本周内交",
      startTime: "2026-09-12T02:00:00.000Z",
      endTime: "2026-09-20T15:59:00.000Z",
      knowledgeBaseId: 7,
      ...overrides,
    },
  });
}

/** 打开日期浮层、点某一天、改时间、确定——快捷胶囊之外唯一能改时间的方式。 */
function pickDate(fieldLabel: string, day: string, time: string) {
  fireEvent.click(screen.getByLabelText(fieldLabel));
  fireEvent.click(screen.getByRole("button", { name: day }));
  fireEvent.change(screen.getByLabelText("时间"), { target: { value: time } });
  fireEvent.click(screen.getByRole("button", { name: "确定" }));
}

beforeEach(() => {
  // 真实时钟会让「2 周胶囊」这类断言漂移，整组用例锁死时间。
  // `shouldAdvanceTime` 是必须的：react-query 内部用 setTimeout 调度通知，
  // 冻结定时器会让 renderWithProviders 直接挂死。
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  Element.prototype.scrollIntoView = vi.fn();
  mockBase();
  adminTask.mockReturnValue({ ...IDLE, data: undefined });
  createPending.value = false;
  updatePending.value = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TaskFormPage 新建", () => {
  it("默认值：开始取下一个整点，截止为开始 + 7 天的 23:59（图例 6 / 7）", () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    expect(screen.getByLabelText("开始时间")).toHaveTextContent(START_TEXT);
    expect(screen.getByLabelText("截止时间")).toHaveTextContent(DEFAULT_END_TEXT);
    expect(screen.getByTestId("task-form-base")).toHaveTextContent("产品设计知识库");
  });

  it("名称计数随输入更新（图例 5）", () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    expect(screen.getByText("0 / 20")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读书笔记" } });
    expect(screen.getByText("4 / 20")).toBeInTheDocument();
  });

  it("名称为空提交 → 内联「请填写任务名称」，不发请求", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    expect(await screen.findByText("请填写任务名称")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("任务名称")).toHaveAttribute("aria-invalid", "true");
    // 不弹 toast：错误就在字段旁边（图例 11 的"不弹 toast"）
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("空名称提交 → 滚动并聚焦到任务名称（图例 11）", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    await screen.findByText("请填写任务名称");
    expect(screen.getByLabelText("任务名称")).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("只有截止出错时聚焦到截止字段，不误聚焦名称", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    pickDate("截止时间", "2026-09-09", "09:00");
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    await screen.findByText("截止时间必须晚于开始时间");
    expect(screen.getByLabelText("截止时间")).toHaveFocus();
    expect(screen.getByLabelText("任务名称")).not.toHaveFocus();
  });

  it("只输空格也算空，trim 后再判", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    expect(await screen.findByText("请填写任务名称")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("21 字名称 → 内联「任务名称最多 20 个字」，不发请求", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    // maxLength 只挡真实键入，fireEvent.change 仍能写进 21 字——正是要验的边界
    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "字".repeat(21) } });
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    expect(await screen.findByText("任务名称最多 20 个字")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("20 字刚好合法，能提交", async () => {
    createMutate.mockResolvedValue({ id: 88 });
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "字".repeat(20) } });
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
  });

  it("截止早于开始 → 内联「截止时间必须晚于开始时间」，且 endTime 字段 aria-invalid（图例 13）", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    // 截止选到开始（09-10 11:00）之前：09-09 09:00
    pickDate("截止时间", "2026-09-09", "09:00");
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    expect(await screen.findByText("截止时间必须晚于开始时间")).toBeInTheDocument();
    // 错误挂在截止字段上（refine 的 path 是 endTime），描红要落在它身上
    expect(screen.getByLabelText("截止时间")).toHaveAttribute("aria-invalid", "true");
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("错误修正后描红撤掉", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    pickDate("截止时间", "2026-09-09", "09:00");
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));
    expect(await screen.findByText("截止时间必须晚于开始时间")).toBeInTheDocument();

    // 点「2 周」把截止推回合法区间
    fireEvent.click(screen.getByRole("button", { name: "2 周" }));
    expect(screen.queryByText("截止时间必须晚于开始时间")).toBeNull();
    expect(screen.getByLabelText("截止时间")).toHaveAttribute("aria-invalid", "false");
  });

  it("快捷胶囊「2 周」把截止回填成开始日 + 14 天的 23:59（图例 8）", () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.click(screen.getByRole("button", { name: "2 周" }));

    expect(screen.getByLabelText("截止时间")).toHaveTextContent(TWO_WEEK_END_TEXT);
    // 选中的胶囊是 accent 软底
    expect(screen.getByRole("button", { name: "2 周" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1 周" })).toHaveAttribute("aria-pressed", "false");
  });

  it("胶囊按**当前**开始时间回填，改了开始时间后按新值算", () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    pickDate("开始时间", "2026-09-15", "08:30");
    fireEvent.click(screen.getByRole("button", { name: "1 周" }));

    expect(screen.getByLabelText("截止时间")).toHaveTextContent("09-22 23:59");
  });

  it("新建 payload：字段齐全、时间是 Date 实例（hook 内部再 toISOString）", async () => {
    createMutate.mockResolvedValue({ id: 88 });
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "  读书笔记  " } });
    fireEvent.change(screen.getByTestId("task-describe"), { target: { value: "**本周内**交" } });
    pickDate("截止时间", "2026-09-20", "18:00");
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    const payload = createMutate.mock.calls[0]?.[0] as Record<string, unknown>;

    // trim 由 schema 负责，这里断言它确实生效了（否则后端收到首尾空格）
    expect(payload.taskName).toBe("读书笔记");
    expect(payload.taskDescribe).toBe("**本周内**交");
    expect(payload.knowledgeBaseId).toBe(7);
    expect(payload.taskId).toBeUndefined();

    expect(payload.startTime).toBeInstanceOf(Date);
    expect(payload.endTime).toBeInstanceOf(Date);
    const start = payload.startTime as Date;
    const end = payload.endTime as Date;
    expect(start.getHours()).toBe(11);
    expect(start.getMinutes()).toBe(0);
    expect(end.getDate()).toBe(20);
    expect(end.getHours()).toBe(18);
    expect(end.getMinutes()).toBe(0);
  });

  it("成功：toast「任务已发布」并跳新建任务的详情页", async () => {
    createMutate.mockResolvedValue({ id: 88 });
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("任务已发布"));
    expect(push).toHaveBeenCalledWith("/notes/7/tasks/88");
  });

  it("提交中：按钮转圈显示「发布中…」、整表单只读（图例 15）", async () => {
    // 永不 resolve 的 promise：把界面钉在"请求飞行中"这一刻
    createMutate.mockReturnValue(new Promise(() => {}));
    const { rerender } = renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    createPending.value = true;
    rerender(<TaskFormPage baseId={7} mode="new" />);
    fireEvent.click(screen.getByRole("button", { name: "发布中…" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /发布中…/ })).toBeInTheDocument(),
    );
    // 主按钮里有转圈
    expect(screen.getByRole("button", { name: /发布中…/ }).querySelector("svg")).not.toBeNull();
    // 所有输入都禁用，编辑器只读
    expect(screen.getByLabelText("任务名称")).toBeDisabled();
    expect(screen.getByLabelText("开始时间")).toBeDisabled();
    expect(screen.getByLabelText("截止时间")).toBeDisabled();
    expect(screen.getByRole("button", { name: "1 周" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByTestId("task-describe")).toBeDisabled();
  });

  it("失败：toast 后端原因、保留输入、不跳转", async () => {
    createMutate.mockRejectedValue(new Error("任务名称已存在"));
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    fireEvent.change(screen.getByTestId("task-describe"), { target: { value: "说明" } });
    fireEvent.click(screen.getByRole("button", { name: "发布任务" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("任务名称已存在"));
    // 输入必须还在，不能因为一次失败就清空重填
    expect(screen.getByLabelText("任务名称")).toHaveValue("读论文");
    expect(screen.getByTestId("task-describe")).toHaveValue("说明");
    expect(push).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("TaskFormPage 编辑", () => {
  it("预填详情：标题 / 字段 / 按钮 / 返回都切到编辑口径（图例 14）", () => {
    mockAdminTask();
    renderWithProviders(<TaskFormPage baseId={7} mode="edit" taskId={42} />);

    expect(screen.getByRole("heading", { name: "编辑任务" })).toBeInTheDocument();
    expect(
      screen.getByText("修改会立即对本库成员生效，已有的提交记录不受影响。"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("task-form-back")).toHaveTextContent("‹ 任务详情");
    expect(screen.getByRole("button", { name: "保存修改" })).toBeInTheDocument();

    expect(screen.getByLabelText("任务名称")).toHaveValue("读论文");
    expect(screen.getByTestId("task-describe")).toHaveValue("本周内交");
    // ISO 串按本地时区渲染成 MM-dd HH:mm
    const start = new Date("2026-09-12T02:00:00.000Z");
    const end = new Date("2026-09-20T15:59:00.000Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(screen.getByLabelText("开始时间")).toHaveTextContent(
      `${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:${pad(start.getMinutes())}`,
    );
    expect(screen.getByLabelText("截止时间")).toHaveTextContent(
      `${pad(end.getMonth() + 1)}-${pad(end.getDate())} ${pad(end.getHours())}:${pad(end.getMinutes())}`,
    );
  });

  it("PATCH payload 带 taskId，且不含 knowledgeBaseId（知识库不可改）", async () => {
    mockAdminTask();
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<TaskFormPage baseId={7} mode="edit" taskId={42} />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文（修订）" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    const payload = updateMutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.taskId).toBe(42);
    expect(payload.taskName).toBe("读论文（修订）");
    expect(payload.startTime).toBeInstanceOf(Date);
    expect(payload.endTime).toBeInstanceOf(Date);
    expect("knowledgeBaseId" in payload).toBe(false);
  });

  it("保存成功：toast「已保存」并回详情", async () => {
    mockAdminTask();
    updateMutate.mockResolvedValue(undefined);
    renderWithProviders(<TaskFormPage baseId={7} mode="edit" taskId={42} />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文（修订）" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("已保存"));
    expect(push).toHaveBeenCalledWith("/notes/7/tasks/42");
  });

  it("预填只做一次：数据重取不会覆盖用户已经改过的输入", () => {
    mockAdminTask();
    const { rerender } = renderWithProviders(<TaskFormPage baseId={7} mode="edit" taskId={42} />);
    expect(screen.getByLabelText("任务名称")).toHaveValue("读论文");

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "我改过的" } });
    // 失效重取后详情数据换了新对象，但用户的手改不能被回灌掉
    mockAdminTask({ taskName: "读论文" });
    rerender(<TaskFormPage baseId={7} mode="edit" taskId={42} />);

    expect(screen.getByLabelText("任务名称")).toHaveValue("我改过的");
  });

  it("保存中按钮显示「保存中…」而不是「发布中…」", () => {
    mockAdminTask();
    updatePending.value = true;
    renderWithProviders(<TaskFormPage baseId={7} mode="edit" taskId={42} />);

    expect(screen.getByRole("button", { name: /保存中…/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /发布中…/ })).toBeNull();
  });

  it("详情时间字段为空时不崩，退回默认时间窗", () => {
    mockAdminTask({ startTime: null, endTime: null });
    renderWithProviders(<TaskFormPage baseId={7} mode="edit" taskId={42} />);

    expect(screen.getByLabelText("开始时间")).toHaveTextContent(START_TEXT);
    expect(screen.getByLabelText("截止时间")).toHaveTextContent(DEFAULT_END_TEXT);
  });
});

describe("TaskFormPage 离开保护", () => {
  it("没有改动时点「取消」直接跳任务 Tab，不弹确认", () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByText("放弃未保存的修改？")).toBeNull();
    expect(push).toHaveBeenCalledWith("/notes/7/tasks");
  });

  it("有改动时点「取消」先弹 ConfirmDialog，点「放弃修改」才跳转", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(await screen.findByText("放弃未保存的修改？")).toBeInTheDocument();
    expect(screen.getByText("离开后本次填写的内容不会保留。")).toBeInTheDocument();
    // 还没确认，先不许走
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/notes/7/tasks"));
  });

  it("确认框里点「取消」留在原页，输入保留", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await screen.findByText("放弃未保存的修改？");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() => expect(screen.queryByText("放弃未保存的修改？")).toBeNull());
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("任务名称")).toHaveValue("读论文");
  });

  it("「‹ 任务」走同一个出口：有改动同样弹确认，编辑模式回详情", async () => {
    mockAdminTask();
    renderWithProviders(<TaskFormPage baseId={7} mode="edit" taskId={42} />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "改了一下" } });
    fireEvent.click(screen.getByTestId("task-form-back"));
    expect(await screen.findByText("放弃未保存的修改？")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "放弃修改" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/notes/7/tasks/42"));
  });

  it("只改了描述也算脏", async () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByTestId("task-describe"), { target: { value: "补充说明" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(await screen.findByText("放弃未保存的修改？")).toBeInTheDocument();
  });

  it("有改动时注册 beforeunload，且 preventDefault 被调用", () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "读论文" } });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("没有改动时不拦 beforeunload", () => {
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe("TaskFormPage 权限", () => {
  it("非管理员（permissions !== 1）回任务 Tab 并提示（§12.1.1 第 3 点）", async () => {
    mockBase(3);
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/notes/7/tasks"));
    expect(toast.error).toHaveBeenCalledWith("只有知识库管理员可以发布任务");
    // 不该渲染表单，避免用户在跳转前看到半秒可编辑的界面
    expect(screen.queryByTestId("task-form-page")).toBeNull();
  });

  it("管理员（permissions === 1）正常渲染", () => {
    mockBase(1);
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    expect(screen.getByTestId("task-form-page")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("知识库还没加载完时先不判定权限，不误伤管理员", () => {
    baseQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    renderWithProviders(<TaskFormPage baseId={7} mode="new" />);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByTestId("task-form-page")).toBeInTheDocument();
  });
});
