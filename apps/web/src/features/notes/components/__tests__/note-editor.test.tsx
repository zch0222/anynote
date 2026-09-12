import { noteApi } from "@/lib/api/openapi";
import { renderWithProviders } from "@/test/render";
import { act, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "../note-editor";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/** 编辑器整包走 dynamic 懒加载，测试里换成能记录 props 的桩件。 */
const editorProps = vi.fn();
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div data-testid="tiptap-stub" className={String(props.className ?? "")} />;
  },
}));

const get = noteApi.GET as unknown as Mock;

const BASE_ID = 7;
const NOTE_ID = 42;

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

beforeEach(() => {
  get.mockReset();
  vi.mocked(noteApi.PATCH).mockReset();
  editorProps.mockReset();
  get.mockImplementation((path: string) => {
    if (path === "/notes/{noteId}") {
      return Promise.resolve(
        envelope({
          id: NOTE_ID,
          title: "测试笔记",
          content: "正文",
          knowledgeBaseId: BASE_ID,
          knowledgeBaseName: "测试库",
          updateTime: "2026-09-11T01:00:00.000Z",
        }),
      );
    }
    if (path === "/bases") {
      return Promise.resolve(envelope({ rows: [{ id: BASE_ID, knowledgeBaseName: "测试库" }] }));
    }
    if (path === "/notes") {
      return Promise.resolve(envelope({ rows: [{ id: NOTE_ID, title: "测试笔记" }] }));
    }
    return Promise.resolve(envelope(null));
  });
});

describe("NoteEditor 布局与编辑器接线", () => {
  it("正文首个 H1 改动立即更新笔记标题，并将标题与正文一起保存", async () => {
    vi.mocked(noteApi.PATCH).mockResolvedValue(envelope({ version: "next" }) as never);
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());
    act(() => {
      editorProps.mock.calls.at(-1)?.[0].onChange("# 同步标题\n\n正文", {
        state: {
          doc: {
            firstChild: { type: { name: "heading" }, attrs: { level: 1 }, textContent: "同步标题" },
          },
        },
      });
    });
    expect(screen.getByLabelText("笔记标题")).toHaveValue("同步标题");
    await waitFor(
      () =>
        expect(noteApi.PATCH).toHaveBeenCalledWith(
          "/notes/{noteId}",
          expect.objectContaining({
            body: expect.objectContaining({ title: "同步标题", content: "# 同步标题\n\n正文" }),
          }),
        ),
      { timeout: 3000 },
    );
  });

  it("编辑区占满工作区视口高度，而不是跟着内容长短变", async () => {
    const { container } = renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("tiptap-stub")).toBeInTheDocument());

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain("h-[calc(100svh-9rem)]");
    // 没有 min-h-0，flex 子项会被内容撑开，编辑器内部就滚不起来
    expect(shell.className).toContain("min-h-0");
  });

  it("编辑器声明 fill 并占据剩余高度", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    const props = editorProps.mock.calls.at(-1)?.[0];
    expect(props).toMatchObject({ preset: "full", fill: true });
    expect(String(props.className)).toContain("flex-1");
  });

  it("给编辑器接上图片上传实现，笔记里才能插图", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    expect(typeof editorProps.mock.calls.at(-1)?.[0].uploadFn).toBe("function");
  });

  it("笔记加载失败时展示错误而不是空编辑器", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/notes/{noteId}") {
        return Promise.resolve(envelope(null, "A0301"));
      }
      return Promise.resolve(envelope({ rows: [] }));
    });
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);

    await waitFor(() => expect(screen.getByText(/笔记加载失败/)).toBeInTheDocument());
    expect(screen.queryByTestId("tiptap-stub")).toBeNull();
  });
});
