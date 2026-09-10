import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(),
}));
vi.mock("@/features/notes/use-notes", () => ({
  useNotesQuery: vi.fn(),
}));
vi.mock("@/features/notes/use-note", () => ({
  useNoteQuery: vi.fn(),
}));

import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useNoteQuery } from "@/features/notes/use-note";
import { useNotesQuery } from "@/features/notes/use-notes";
import { WikisPage } from "@/features/wikis/components/wikis-page";
import { renderWithProviders } from "@/test/render";

vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value, preset }: { value: string; preset: string }) => (
    <div data-testid="tiptap-editor-stub" data-preset={preset}>
      {value}
    </div>
  ),
}));
void TiptapEditor;

const PENDING = {
  isPending: true,
  isError: false,
  data: undefined,
  error: undefined as unknown as Error,
};

function mockNotes(returnValue: Record<string, unknown>) {
  vi.mocked(useNotesQuery).mockReturnValue(returnValue as never);
}
function mockBases(returnValue: Record<string, unknown>) {
  vi.mocked(useKnowledgeBasesQuery).mockReturnValue(returnValue as never);
}
function mockNote(returnValue: Record<string, unknown>) {
  vi.mocked(useNoteQuery).mockReturnValue(returnValue as never);
}

describe("WikisPage", () => {
  it("无知识库时空态引导", () => {
    mockBases({ ...PENDING, isPending: false, data: [] });
    mockNotes({ ...PENDING, isPending: false, data: { rows: [] } });
    renderWithProviders(<WikisPage />);
    expect(screen.getByText("还没有知识库")).toBeTruthy();
  });

  it("渲染知识库与笔记两级导航，默认选中第一篇并只读渲染", () => {
    mockBases({
      ...PENDING,
      isPending: false,
      data: [
        { id: 5, knowledgeBaseName: "读书笔记" },
        { id: 6, knowledgeBaseName: "工作文档" },
      ],
    });
    mockNotes({
      ...PENDING,
      isPending: false,
      data: {
        rows: [
          { id: 11, title: "第一篇" },
          { id: 12, title: "第二篇" },
        ],
      },
    });
    mockNote({ ...PENDING, isPending: false, data: { title: "第一篇", content: "# 正文" } });

    renderWithProviders(<WikisPage />);
    expect(screen.getByTestId("wiki-base-5")).toBeTruthy();
    expect(screen.getByTestId("wiki-base-6")).toBeTruthy();
    expect(screen.getByTestId("wiki-note-11")).toBeTruthy();
    expect(screen.getByTestId("wiki-note-12")).toBeTruthy();

    const editor = screen.getByTestId("tiptap-editor-stub");
    expect(editor.getAttribute("data-preset")).toBe("readonly");
    expect(editor.textContent).toBe("# 正文");
    expect(screen.getByTestId("wiki-note-view")).toBeTruthy();
  });

  it("知识库下无笔记时展示占位", () => {
    mockBases({ ...PENDING, isPending: false, data: [{ id: 5, knowledgeBaseName: "空库" }] });
    mockNotes({ ...PENDING, isPending: false, data: { rows: [] } });
    renderWithProviders(<WikisPage />);
    expect(screen.getByText("这个知识库下还没有笔记")).toBeTruthy();
    expect(screen.getByText("选择左侧笔记开始阅读。")).toBeTruthy();
  });
});
