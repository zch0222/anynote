import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const search = vi.hoisted(() => ({ current: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/notes/new",
  useSearchParams: () => new URLSearchParams(search.current),
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(),
  useCreateKnowledgeBaseMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

const createNote = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock("@/features/notes/use-create-note", () => ({
  useCreateNoteMutation: () => createNote,
}));

import { MobileCreateNote } from "@/features/notes/components/mobile/create-note-mobile";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { renderWithProviders } from "@/test/render";

const BASES = [
  { id: 3, knowledgeBaseName: "第一个库" },
  { id: 5, knowledgeBaseName: "第二个库" },
];

function mockBases(value: Record<string, unknown>) {
  vi.mocked(useKnowledgeBasesQuery).mockReturnValue(value as never);
}

describe("MobileCreateNote", () => {
  it("默认选中第一个知识库", () => {
    search.current = "";
    mockBases({ isPending: false, isError: false, data: BASES });
    renderWithProviders(<MobileCreateNote />);

    expect(screen.getByRole("button", { name: /第一个库/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /第二个库/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("?baseId= 预选对应知识库——从笔记列表点 + 进来时少点一次", () => {
    search.current = "baseId=5";
    mockBases({ isPending: false, isError: false, data: BASES });
    renderWithProviders(<MobileCreateNote />);

    expect(screen.getByRole("button", { name: /第二个库/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("非法 baseId 退回默认选中，不报错", () => {
    search.current = "baseId=abc";
    mockBases({ isPending: false, isError: false, data: BASES });
    renderWithProviders(<MobileCreateNote />);

    expect(screen.getByRole("button", { name: /第一个库/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("创建成功后跳移动端编辑器而不是桌面地址", async () => {
    search.current = "baseId=5";
    mockBases({ isPending: false, isError: false, data: BASES });
    createNote.mutateAsync.mockResolvedValue(42);
    renderWithProviders(<MobileCreateNote />);

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "移动端笔记" } });
    fireEvent.click(screen.getByRole("button", { name: "创建笔记" }));

    await waitFor(() => {
      expect(createNote.mutateAsync).toHaveBeenCalledWith({
        knowledgeBaseId: 5,
        title: "移动端笔记",
      });
    });
    expect(router.push).toHaveBeenCalledWith("/m/notes/5/42");
  });

  it("标题不合法时不提交（沿用桌面同一个 schema）", async () => {
    search.current = "";
    mockBases({ isPending: false, isError: false, data: BASES });
    createNote.mutateAsync.mockClear();
    renderWithProviders(<MobileCreateNote />);

    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "短" } });
    fireEvent.click(screen.getByRole("button", { name: "创建笔记" }));

    // 校验改用受控 state + 与桌面同一套边界（min 3 / max 15），错误走内联提示。
    // 断言错误文案本身而不是 /标题/：后者会同时命中 <label>标题</label>。
    expect(await screen.findByText("标题至少 3 个字符")).toBeInTheDocument();
    expect(createNote.mutateAsync).not.toHaveBeenCalled();
  });

  it("没有知识库时引导先建库（「新建知识库」行始终在）", () => {
    search.current = "";
    mockBases({ isPending: false, isError: false, data: [] });
    renderWithProviders(<MobileCreateNote />);

    expect(screen.getByText(/还没有知识库/)).toBeInTheDocument();
    expect(screen.getByTestId("create-note-new-base")).toBeInTheDocument();
    // 没有库可选时主按钮禁用，避免提交一个必然失败的创建
    expect(screen.getByRole("button", { name: "创建笔记" })).toBeDisabled();
  });

  it("?title= 预填标题（M-10 的「用「{q}」新建笔记」带过来）", () => {
    search.current = "title=周报模板";
    mockBases({ isPending: false, isError: false, data: BASES });
    renderWithProviders(<MobileCreateNote />);

    expect(screen.getByLabelText("标题")).toHaveValue("周报模板");
    expect(screen.getByText("4 / 15")).toBeInTheDocument();
  });

  it("已选库行是 accent + ✓，库行左侧用渐变方块", () => {
    search.current = "baseId=5";
    mockBases({ isPending: false, isError: false, data: BASES });
    renderWithProviders(<MobileCreateNote />);

    const selected = screen.getByTestId("create-note-base-5");
    expect(selected.className).toContain("text-accent");
    expect(selected.querySelector(".kb-cover")).toBeTruthy();
  });
});
