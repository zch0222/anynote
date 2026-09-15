import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
  Toaster: () => null,
}));

const useKnowledgeBaseQuery = vi.fn();
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: (...args: unknown[]) => useKnowledgeBaseQuery(...args),
}));

const useMoocsQuery = vi.fn();
const mutateAsync = vi.fn();
vi.mock("../../use-moocs", () => ({
  useMoocsQuery: (...args: unknown[]) => useMoocsQuery(...args),
  useCreateMoocMutation: () => ({ mutateAsync, isPending: false }),
}));

import { MoocPage } from "../mooc-page";

const IDLE = { isPending: false, isError: false, isFetching: false };

const MOOC_ROWS = [
  { id: 9, title: "数据结构", moocDescription: "入门课" },
  { id: 10, title: "算法", moocDescription: null },
];

function mockBase(permissions: number) {
  useKnowledgeBaseQuery.mockReturnValue({
    ...IDLE,
    data: { id: 5, knowledgeBaseName: "产品设计", permissions },
  } as never);
}

function mockMoocs(rows: unknown[]) {
  useMoocsQuery.mockReturnValue({ ...IDLE, data: { rows, total: rows.length } } as never);
}

function reset() {
  toastSuccess.mockReset();
  toastError.mockReset();
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(66);
  mockBase(1);
  mockMoocs(MOOC_ROWS);
}

describe("MoocPage（D-05）", () => {
  it("权限 1/2 显示页头「新建课程」，权限 3/4 隐藏", () => {
    for (const [permissions, visible] of [
      [1, true],
      [2, true],
      [3, false],
      [4, false],
    ] as const) {
      reset();
      mockBase(permissions);
      const { unmount } = renderWithProviders(<MoocPage baseId={5} />);
      const button = screen.queryByTestId("mooc-create");
      if (visible) {
        expect(button).not.toBeNull();
      } else {
        expect(button).toBeNull();
      }
      unmount();
    }
  });

  it("权限未知时也不出新建入口（宁可后出现，也不要让只读成员点了被拒）", () => {
    reset();
    useKnowledgeBaseQuery.mockReturnValue({ ...IDLE, data: undefined } as never);
    renderWithProviders(<MoocPage baseId={5} />);
    expect(screen.queryByTestId("mooc-create")).toBeNull();
  });

  it("整张卡片是链接，指向知识库内的课程详情", () => {
    reset();
    renderWithProviders(<MoocPage baseId={5} />);

    const card = screen.getByTestId("mooc-card-9");
    expect(card.tagName).toBe("A");
    expect(card).toHaveAttribute("href", "/notes/5/mooc/9");
    // 旧地址 /mooc/9 会落回跨库列表，不该再出现
    expect(card.getAttribute("href")).not.toBe("/mooc/9");
  });

  it("名称不足 2 字内联报错且不发请求，不弹 toast", async () => {
    reset();
    renderWithProviders(<MoocPage baseId={5} />);

    fireEvent.click(screen.getByTestId("mooc-create"));
    const input = await screen.findByTestId("mooc-title-input");

    fireEvent.change(input, { target: { value: "数" } });
    fireEvent.click(screen.getByTestId("mooc-submit"));

    expect(await screen.findByText("课程名称至少 2 个字符")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();

    // 改成合规后错误消失
    fireEvent.change(input, { target: { value: "数学" } });
    expect(screen.queryByText("课程名称至少 2 个字符")).toBeNull();
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("回车提交：表单内 Enter 走同一条提交路径", async () => {
    reset();
    renderWithProviders(<MoocPage baseId={5} />);

    fireEvent.click(screen.getByTestId("mooc-create"));
    const input = await screen.findByTestId("mooc-title-input");
    fireEvent.change(input, { target: { value: "高等数学" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]?.[0]).toMatchObject({
      title: "高等数学",
      knowledgeBaseId: 5,
    });
  });

  it("对话框说明带上当前知识库名，并有取消按钮", async () => {
    reset();
    renderWithProviders(<MoocPage baseId={5} />);

    fireEvent.click(screen.getByTestId("mooc-create"));
    expect(await screen.findByText("课程会创建在「产品设计」下。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  });

  it("空态带「新建课程」次按钮，打开同一个对话框", async () => {
    reset();
    mockMoocs([]);
    renderWithProviders(<MoocPage baseId={5} />);

    expect(await screen.findByText("这个知识库下还没有课程")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mooc-create-empty"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("只读成员的空态不出新建按钮", async () => {
    reset();
    mockBase(3);
    mockMoocs([]);
    renderWithProviders(<MoocPage baseId={5} />);

    expect(await screen.findByText("这个知识库下还没有课程")).toBeInTheDocument();
    expect(screen.queryByTestId("mooc-create-empty")).toBeNull();
  });

  it("加载失败显示 QueryError 且可重试", async () => {
    reset();
    useMoocsQuery.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      error: new Error("boom"),
    });
    renderWithProviders(<MoocPage baseId={5} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("课程加载失败：");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("名称计数显示当前长度与上限", async () => {
    reset();
    renderWithProviders(<MoocPage baseId={5} />);

    fireEvent.click(screen.getByTestId("mooc-create"));
    const input = await screen.findByTestId("mooc-title-input");
    fireEvent.change(input, { target: { value: "数据" } });
    expect(screen.getByText("2 / 50")).toBeInTheDocument();
  });
});
