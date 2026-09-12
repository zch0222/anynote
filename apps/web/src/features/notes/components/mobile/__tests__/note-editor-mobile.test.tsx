import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/notes/3/7",
}));

vi.mock("@/features/notes/use-note", () => ({ useNoteQuery: vi.fn() }));
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: [
      { id: 3, knowledgeBaseName: "当前库" },
      { id: 5, knowledgeBaseName: "另一个库" },
    ],
  })),
}));

const save = vi.hoisted(() => ({
  status: "saved" as string,
  lastSavedAt: null,
  conflict: null,
  scheduleSave: vi.fn(),
  flush: vi.fn(async () => undefined),
  resolveConflict: vi.fn(),
  hasPendingChanges: () => false,
}));
vi.mock("@/features/notes/use-save-note", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@/features/notes/use-save-note");
  return { ...actual, useSaveNote: () => save };
});

const move = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => undefined) }));
const remove = vi.hoisted(() => ({ mutateAsync: vi.fn(async () => undefined) }));
vi.mock("@/features/notes/use-move-note", () => ({ useMoveNoteMutation: () => move }));
vi.mock("@/features/notes/use-delete-note", () => ({ useDeleteNoteMutation: () => remove }));

// 编辑器整包在 jsdom 里跑不动也没必要，这里只验证接线
const editorProps = vi.fn();
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: (props: { toolbar?: string; value: string }) => {
    editorProps(props);
    return (
      <div data-testid="editor" data-toolbar={props.toolbar}>
        {props.value}
      </div>
    );
  },
}));

import { MobileNoteEditor } from "@/features/notes/components/mobile/note-editor-mobile";
import { useNoteQuery } from "@/features/notes/use-note";
import { renderWithProviders } from "@/test/render";

function mockNote(value: Record<string, unknown>) {
  vi.mocked(useNoteQuery).mockReturnValue(value as never);
}

const LOADED = {
  isPending: false,
  isError: false,
  data: { title: "会议纪要", content: "正文内容", updateTime: "2026-09-12T08:00:00" },
};

describe("MobileNoteEditor", () => {
  it("用移动端工具条，并把标题与正文灌进编辑器", () => {
    mockNote(LOADED);
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    expect(screen.getByLabelText("笔记标题")).toHaveValue("会议纪要");
    expect(screen.getByTestId("editor")).toHaveAttribute("data-toolbar", "mobile");
    expect(screen.getByTestId("editor")).toHaveTextContent("正文内容");
  });

  it("保存状态显示在顶栏而不是占正文空间", () => {
    mockNote(LOADED);
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);
    expect(screen.getByRole("status")).toHaveTextContent("已保存");
  });

  it("改标题会进自动保存队列（复用桌面同一个 useSaveNote）", () => {
    mockNote(LOADED);
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    fireEvent.change(screen.getByLabelText("笔记标题"), { target: { value: "新标题" } });
    expect(save.scheduleSave).toHaveBeenCalledWith({ title: "新标题", content: "正文内容" });
  });

  it("修改顶部 H1 同步移动端标题，并和正文一起自动保存", () => {
    mockNote(LOADED);
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);
    act(() => {
      editorProps.mock.calls.at(-1)?.[0].onChange("# 移动端新标题", {
        state: {
          doc: {
            firstChild: {
              type: { name: "heading" },
              attrs: { level: 1 },
              textContent: "移动端新标题",
            },
          },
        },
      });
    });
    expect(screen.getByLabelText("笔记标题")).toHaveValue("移动端新标题");
    expect(save.scheduleSave).toHaveBeenLastCalledWith({
      title: "移动端新标题",
      content: "# 移动端新标题",
    });
  });

  it("「移动到…」只列出别的知识库，且先落盘再移动", async () => {
    mockNote(LOADED);
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    fireEvent.click(screen.getByTestId("mobile-note-actions"));
    expect(screen.queryByRole("button", { name: /移动到「当前库」/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /移动到「另一个库」/ }));

    await waitFor(() => {
      expect(move.mutateAsync).toHaveBeenCalledWith({ noteId: 7, knowledgeBaseId: 5 });
    });
    // 未保存的正文必须先 flush，否则跳转后这段改动就丢了
    expect(save.flush).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/m/notes/5/7");
  });

  it("删除需要二次确认，确认后回到该知识库的列表", async () => {
    mockNote(LOADED);
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    fireEvent.click(screen.getByTestId("mobile-note-actions"));
    fireEvent.click(screen.getByRole("button", { name: "删除笔记" }));
    expect(remove.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "再点一次确认删除" }));
    await waitFor(() => {
      expect(remove.mutateAsync).toHaveBeenCalledWith(7);
    });
    expect(router.push).toHaveBeenCalledWith("/m/notes/3");
  });

  it("加载中渲染骨架而不是空编辑器", () => {
    mockNote({ isPending: true, isError: false, data: undefined });
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    expect(screen.queryByTestId("editor")).toBeNull();
    expect(screen.getByLabelText("返回")).toBeInTheDocument();
  });

  it("加载失败展示错误并保留返回键", () => {
    mockNote({ isPending: false, isError: true, error: new Error("没有权限") });
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    expect(screen.getByText(/笔记加载失败：没有权限/)).toBeInTheDocument();
    expect(screen.getByLabelText("返回")).toBeInTheDocument();
  });
});
