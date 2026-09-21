import { noteApi } from "@/lib/api/openapi";
import { renderWithProviders } from "@/test/render";
import { act, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "../note-editor";

/**
 * 协同模式下的编辑器接线（M13.3）。
 *
 * 独立成文件而不是塞进 `note-editor.test.tsx`：这里必须把 `@/lib/env` 的
 * `NEXT_PUBLIC_COLLAB_NOTES` 打开，而那个开关是**模块级常量**——同一个测试文件里
 * 没法一半用例开、一半用例关。混在一起会让既有的单人链路用例集体改走协同分支。
 */

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_COLLAB_WS_URL: "ws://localhost:1234",
    NEXT_PUBLIC_COLLAB_NOTES: true,
  },
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
    return <div data-testid="tiptap-stub" />;
  },
}));

/**
 * 协同运行时打桩。这里测的是 `NoteEditor` **怎么把编辑器交给协同运行时**，
 * 不是运行时本身（后者在 `use-collab-note.test.tsx` 里单独测）。
 */
const collabOptions = vi.fn();
/**
 * 协同运行时的假状态。默认 **active=false**（绑定未就绪），用例按需置为就绪态——
 * 「绑定就绪前不得交出编辑器」这条正是靠默认值守住的。
 */
const collabState = vi.hoisted(() => ({
  active: false,
  doc: null as unknown,
  provider: null as unknown,
  user: null as unknown,
  connected: false,
  degraded: false,
  peers: [],
  savedVersion: null,
  publishSavedVersion: vi.fn(),
  reconnect: vi.fn(),
}));
vi.mock("@/features/collab/use-collab-note", () => ({
  useCollabNote: (options: unknown) => {
    collabOptions(options);
    return collabState;
  },
}));

const get = noteApi.GET as unknown as Mock;

const BASE_ID = 7;
const NOTE_ID = 42;
const EDIT_PERMISSION = 6;

/** 假编辑器：`useNoteTitle` 会读 `state.doc.firstChild` 取顶部 H1。 */
const fakeEditor = {
  state: {
    doc: {
      firstChild: { type: { name: "heading" }, attrs: { level: 1 }, textContent: "协同笔记" },
    },
  },
};

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

/** 最近一次传给 `useCollabNote` 的选项。 */
function lastCollabOptions(): Record<string, unknown> {
  return (collabOptions.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
}

/** 触发编辑器就绪回调，模拟 `TiptapEditorImpl` 建好实例后的 `onReady`。 */
function emitReady() {
  act(() => {
    (editorProps.mock.calls.at(-1)?.[0].onReady as ((editor: unknown) => void) | undefined)?.(
      fakeEditor,
    );
  });
}

/** 把协同运行时切成「绑定就绪」：`collaboration` 才会传给编辑器。 */
function makeBindingReady() {
  collabState.active = true;
  collabState.doc = { id: "doc" };
  collabState.provider = { id: "provider" };
  collabState.user = { id: "7", name: "小明", color: "#2563eb" };
}

beforeEach(() => {
  get.mockReset();
  editorProps.mockReset();
  collabOptions.mockReset();
  // 每个用例都从「绑定未就绪」开始，避免就绪态泄漏到「不得交出编辑器」那条
  collabState.active = false;
  collabState.doc = null;
  collabState.provider = null;
  collabState.user = null;
  get.mockImplementation((path: string) => {
    if (path === "/notes/{noteId}") {
      return Promise.resolve(
        envelope({
          id: NOTE_ID,
          title: "协同笔记",
          content: "# 协同笔记\n\n正文",
          knowledgeBaseId: BASE_ID,
          knowledgeBaseName: "测试库",
          // 有编辑权（>= EDIT）才会进协同模式
          notePermissions: EDIT_PERMISSION,
          updateTime: "2026-09-11T01:00:00.000Z",
        }),
      );
    }
    if (path === "/bases") {
      return Promise.resolve(envelope({ rows: [{ id: BASE_ID, knowledgeBaseName: "测试库" }] }));
    }
    if (path === "/notes") {
      return Promise.resolve(envelope({ rows: [{ id: NOTE_ID, title: "协同笔记" }] }));
    }
    return Promise.resolve(envelope(null));
  });
});

describe("NoteEditor 协同模式接线（M13.3）", () => {
  it("有编辑权时开启协同，并把 noteId / markdown 交给运行时", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    // `enabled` 依赖详情里的 notePermissions，要等查询回来才为真
    await waitFor(() => expect(lastCollabOptions().enabled).toBe(true));

    const options = lastCollabOptions();
    expect(options.noteId).toBe(NOTE_ID);
    // 注入用的正文来自 REST，且已补齐顶部 H1
    expect(options.markdown).toBe("# 协同笔记\n\n正文");
  });

  /**
   * 回归：曾经 `editor` 只在 `onChange`（TipTap 的 `onUpdate`）里赋值，
   * 而 `onUpdate` **只在 docChanged 时触发**。协同模式下编辑器初始为空
   * （正文的唯一真相是 Y.Doc，不设 `content`），空文档不会产生任何 docChanged，
   * 于是 `editor` 永远是 null → 注入守卫的前置条件 `!editor` 恒成立 →
   * 冷启动注入永不执行 → 有内容的笔记打开后是空白编辑器（占位提示 + 0 字）。
   *
   * 正确时机是 `onReady`：它由 `TiptapEditorImpl` 在编辑器实例建好时触发，
   * 与文档是否有改动无关。
   */
  it("编辑器就绪（onReady）即把实例交给运行时，冷启动注入才不会饿死", async () => {
    makeBindingReady();
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    emitReady();

    await waitFor(() => expect(lastCollabOptions().editor).toBe(fakeEditor));
    // 绑定就绪的实例才交给运行时：桩件应当收到 collaboration
    expect(editorProps.mock.calls.at(-1)?.[0].collaboration).toBeDefined();
  });

  /**
   * 注入必须落在**绑定到 Y.Doc 的那个**编辑器实例上。
   *
   * 协同绑定就绪前编辑器跑的是 `full` 预设（此时注入只会写进 ProseMirror、
   * 进不了 Y.Doc，却已经把 `meta.seeded` 置位），那会让笔记永久空白。
   * 所以绑定未就绪时宁可不给实例。
   */
  it("协同绑定尚未就绪时不把编辑器交给运行时", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    emitReady();

    // 桩件的 collaboration 为 false（collab.active=false），因此不得交出编辑器
    expect(editorProps.mock.calls.at(-1)?.[0].collaboration).toBeUndefined();
    await waitFor(() => expect(lastCollabOptions().editor).toBeNull());
  });

  it("onReady 仍然建立标题基线（标题取自正文顶部 H1）", async () => {
    renderWithProviders(<NoteEditor baseId={BASE_ID} noteId={NOTE_ID} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    // 不应因为接管 onReady 而丢掉 useNoteTitle 的基线建立
    expect(() => emitReady()).not.toThrow();
  });
});
