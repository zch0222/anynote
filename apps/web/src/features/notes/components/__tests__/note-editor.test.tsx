import { noteApi } from "@/lib/api/openapi";
import { renderWithProviders } from "@/test/render";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "../note-editor";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
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
  router.push.mockReset();
  router.replace.mockReset();
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
    expect(screen.queryByLabelText("笔记标题")).toBeNull();
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

  /**
   * 回归：这一页曾经在正文外面套了一层 `rounded-lg bg-surface shadow-card`，
   * 于是满幅内容区里浮着一张白卡片——与设计稿「编辑器占满剩余所有空间」相反。
   * 满幅的背景与顶栏分隔线由 AppShell 的 isFullBleedRoute 保证，
   * 这里盯住**面板自己不再画卡片**。
   */
  it("编辑面板不画卡片：没有圆角、没有投影，且吃掉剩余高度", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("tiptap-stub")).toBeInTheDocument());

    const panel = screen.getByTestId("note-panel");
    expect(panel.className).not.toMatch(/rounded/);
    expect(panel.className).not.toMatch(/shadow/);
    // 满幅：吃满外层 flex 剩余高度，而不是靠"视口减固定值"去猜页头多高
    expect(panel.className).toContain("flex-1");
    expect(panel.className).toContain("min-h-0");
  });

  it("面板高度不再用 h-[calc(100svh-…)] 猜，改由外层 flex 决定", async () => {
    const { container } = renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("tiptap-stub")).toBeInTheDocument());

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).not.toContain("100svh");
    expect(shell.className).toContain("flex-1");
    // 没有 min-h-0，flex 子项会被内容撑开，编辑器内部就滚不起来
    expect(shell.className).toContain("min-h-0");
  });

  it("编辑器占满纸面宽度，滚动留在中间的正文列里", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    const props = editorProps.mock.calls.at(-1)?.[0];
    // `fill` 是把高度交给外层 flex 的信号；这一版由中间的滚动列统一承担，
    // 编辑器本身不再自己撑满视口，否则标题与元信息行会被顶出可视区。
    expect(props).toMatchObject({ preset: "full" });
    expect(props.fill).toBeUndefined();
    // 正文列自己就是对齐基准（标题/元信息/正文左缘同一条线），编辑器不再叠内边距
    expect(props.flush).toBe(true);
  });

  /**
   * 回归：这里曾经有一个独立的标题输入框，于是同一句话在一屏里出现两次——
   * 输入框一次、正文里再写一次一级标题，而且分不清哪个才是"真的"。
   * 现在标题就是正文的首节点 H1；历史笔记（有 title、正文里没有 H1）
   * 打开时由 `ensureLeadingHeading` 补上，否则标题在编辑器里根本看不见。
   */
  it("标题就是正文的首节点 H1，没有独立的标题行", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    expect(screen.queryByLabelText("笔记标题")).toBeNull();
    expect(editorProps.mock.calls.at(-1)?.[0].value).toBe("# 测试笔记\n\n正文");
  });

  it("正文已经有顶部 H1 时不重复补标题", async () => {
    get.mockImplementation((path: string) => {
      if (path === "/notes/{noteId}") {
        return Promise.resolve(
          envelope({
            id: NOTE_ID,
            title: "库里的标题",
            content: "# 正文自己的标题\n\n正文",
            knowledgeBaseId: BASE_ID,
            knowledgeBaseName: "测试库",
            updateTime: "2026-09-11T01:00:00.000Z",
          }),
        );
      }
      return Promise.resolve(envelope({ rows: [] }));
    });
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    expect(editorProps.mock.calls.at(-1)?.[0].value).toBe("# 正文自己的标题\n\n正文");
  });

  it("元信息行在正文之上，字数落在正文末尾且只算正文", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("tiptap-stub")).toBeInTheDocument());

    // 正文首节点是 H1，元信息行插不进"标题与正文之间"，只能落在整篇之上
    const doc = screen.getByTestId("note-document");
    const meta = screen.getByTestId("note-meta");
    expect(doc.firstElementChild).toBe(meta);

    // 设计稿：字数在**正文末尾**，不在标题下面那一行（一行只出现一次）
    expect(meta).not.toHaveTextContent(/\d+ 字/);
    // 字数不含标题：正文是"正文"两个字，标题那 9 个字符不算进来
    expect(screen.getByTestId("note-char-count")).toHaveTextContent("2 字");

    // 元信息行给的是"更新于 + 所属知识库"
    expect(meta).toHaveTextContent("测试库");
    expect(within(meta).getByRole("link", { name: "测试库" })).toHaveAttribute(
      "href",
      `/notes/${BASE_ID}`,
    );
  });

  it("编辑器不再自带宽目录栏——目录在侧栏里", async () => {
    const { container } = renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("tiptap-stub")).toBeInTheDocument());

    // 同一份目录在一屏里出现两次会让人先分辨"哪个才是真的"
    expect(container.querySelector('[aria-label="笔记目录"]')).toBeNull();
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

  /**
   * 回归：删除后曾经 push 到 `/notes/<baseId>/notes`，那条地址会命中
   * `[baseId]/[noteId]` 路由、把字面量 "notes" 当 noteId，然后 notFound()——
   * 用户删完笔记直接掉进 404。列表页的地址是裸的 `/notes/<baseId>`。
   */
  it("删除成功后回到知识库的笔记列表，而不是会 404 的 /notes/<id>/notes", async () => {
    vi.mocked(noteApi.DELETE).mockResolvedValue(envelope(null) as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(screen.getByTestId("tiptap-stub")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("note-actions"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "删除笔记" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/notes/${BASE_ID}`));
    expect(router.push).not.toHaveBeenCalledWith(`/notes/${BASE_ID}/notes`);
  });
});
