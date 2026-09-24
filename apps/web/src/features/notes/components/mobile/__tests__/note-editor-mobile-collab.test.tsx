import { renderWithProviders } from "@/test/render";
import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 移动端笔记编辑器的协同接线（M13.4）。
 *
 * 独立成文件：`NEXT_PUBLIC_COLLAB_NOTES` 是模块级常量，与既有的
 * `note-editor-mobile.test.tsx`（单人链路）不能共存于同一份 mock 里。
 *
 * 盯两件事：
 * 1. 与桌面同源的 P0 —— 编辑器实例必须在 `onReady` 交接，否则冷启动注入饿死、正文空白；
 * 2. 协同态必须**在移动端也可见** —— 徽标改说「已同步」+ 在线成员条，
 *    否则多人共编时移动端用户看不到任何同伴反馈。
 */

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/m/notes/3/7",
}));

vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    NEXT_PUBLIC_COLLAB_WS_URL: "ws://localhost:1234",
    NEXT_PUBLIC_COLLAB_NOTES: true,
  },
}));

vi.mock("@/features/notes/use-note", () => ({ useNoteQuery: vi.fn() }));
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(() => ({ isPending: false, isError: false, data: [] })),
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

vi.mock("@/features/notes/use-move-note", () => ({
  useMoveNoteMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/features/notes/use-delete-note", () => ({
  useDeleteNoteMutation: () => ({ mutateAsync: vi.fn() }),
}));

const editorProps = vi.fn();
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div data-testid="editor" />;
  },
}));

const collabOptions = vi.fn();
/** 默认「绑定未就绪」（active=false），就绪态由用例显式打开。 */
const collabState = vi.hoisted(() => ({
  active: false,
  doc: null as unknown,
  provider: null as unknown,
  user: null as unknown,
  connected: false,
  degraded: false,
  contentReady: true,
  editable: true,
  peers: [] as Array<{ clientId: number; name: string; color: string; self: boolean }>,
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

import { MobileNoteEditor } from "@/features/notes/components/mobile/note-editor-mobile";
import { useNoteQuery } from "@/features/notes/use-note";

const fakeEditor = {
  state: {
    doc: {
      firstChild: { type: { name: "heading" }, attrs: { level: 1 }, textContent: "会议纪要" },
    },
  },
};

function lastOptions(): Record<string, unknown> {
  return (collabOptions.mock.calls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
}

function emitReady() {
  act(() => {
    (editorProps.mock.calls.at(-1)?.[0].onReady as ((editor: unknown) => void) | undefined)?.(
      fakeEditor,
    );
  });
}

function makeBindingReady() {
  collabState.active = true;
  collabState.connected = true;
  collabState.doc = { id: "doc" };
  collabState.provider = { id: "provider" };
  collabState.user = { id: "7", name: "小明", color: "#2563eb" };
}

beforeEach(() => {
  editorProps.mockReset();
  collabOptions.mockReset();
  collabState.active = false;
  collabState.connected = false;
  collabState.degraded = false;
  collabState.contentReady = true;
  collabState.editable = true;
  collabState.doc = null;
  collabState.provider = null;
  collabState.user = null;
  collabState.peers = [];

  vi.mocked(useNoteQuery).mockReturnValue({
    isPending: false,
    isError: false,
    data: {
      title: "会议纪要",
      content: "正文内容",
      updateTime: "2026-09-12T08:00:00",
      knowledgeBaseName: "产品设计知识库",
      notePermissions: 6,
    },
  } as never);
});

describe("移动端笔记协同接线（M13.4）", () => {
  it("有编辑权时开启协同，并用移动端工具条", async () => {
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);
    await waitFor(() => expect(lastOptions().enabled).toBe(true));

    expect(lastOptions().noteId).toBe(7);
    expect(editorProps.mock.calls.at(-1)?.[0].toolbar).toBe("mobile");
  });

  /**
   * 与桌面同源的 P0 回归：实例必须在 `onReady` 交接。
   * 协同模式编辑器初始为空、空文档不产生 `docChanged`，靠 `onChange` 赋值
   * 会让实例永远是 null，冷启动注入永不执行（正文空白）。
   */
  it("编辑器就绪即把实例交给运行时（onReady 交接）", async () => {
    makeBindingReady();
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    emitReady();

    await waitFor(() => expect(lastOptions().editor).toBe(fakeEditor));
  });

  it("协同绑定未就绪时不交出编辑器", async () => {
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    emitReady();

    await waitFor(() => expect(lastOptions().editor).toBeNull());
  });

  it("协同连接正常时保存态徽标显示「已同步」而不是「已保存」", async () => {
    makeBindingReady();
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已同步"));
    expect(screen.getByRole("status")).not.toHaveTextContent("已保存");
  });

  it("协同态渲染在线成员条，移动端能看到同伴", async () => {
    makeBindingReady();
    collabState.peers = [
      { clientId: 7, name: "小明", color: "#2563eb", self: true },
      { clientId: 9, name: "小红", color: "#e11d48", self: false },
    ];
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    await waitFor(() => expect(screen.getByLabelText("在线成员 2 人")).toBeInTheDocument());
  });

  it("单人链路（协同未就绪）不渲染在线成员条", async () => {
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    expect(screen.queryByLabelText(/在线成员/)).toBeNull();
  });

  it("协同降级时给出提示条并能重连", async () => {
    collabState.degraded = true;
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    const alert = await screen.findByTestId("collab-degraded");
    expect(alert).toHaveTextContent("协同服务连不上");
    expect(screen.getByRole("button", { name: "重连" })).toBeInTheDocument();
  });
});

describe("移动端协同连接期间的可写状态", () => {
  /**
   * 与桌面同一条约束：协同绑定到位前编辑器必须只读。
   *
   * 移动端更要紧——软键盘一弹用户就开始打字，而绑定到位后编辑器实例会被重建，
   * 这期间的输入连同旧实例一起丢掉；若房间正文还空，那一拍保存还会把库里的正文覆盖掉。
   */
  it("正文未就位时 editable=false，并给出提示条", async () => {
    collabState.contentReady = false;
    collabState.editable = false;
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);

    await waitFor(() => expect(editorProps).toHaveBeenCalled());
    expect(editorProps.mock.calls.at(-1)?.[0].editable).toBe(false);
    expect(await screen.findByTestId("collab-connecting")).toBeTruthy();
  });

  it("正文就位后可写，且不显示提示条", async () => {
    renderWithProviders(<MobileNoteEditor baseId={3} noteId={7} />);
    await waitFor(() => expect(editorProps).toHaveBeenCalled());

    expect(editorProps.mock.calls.at(-1)?.[0].editable).toBe(true);
    expect(screen.queryByTestId("collab-connecting")).toBeNull();
  });
});
