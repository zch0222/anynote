import { act, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scroll = vi.hoisted(() => vi.fn(() => true));
vi.mock("@/lib/ai/note-location", () => ({
  scrollToNoteCitation: scroll,
  locateFromSearch: vi.fn(() => null),
  isNewerUpdateTime: (next: string | null | undefined, current: string | null | undefined) => {
    const nextTime = next ? Date.parse(next) : Number.NaN;
    const currentTime = current ? Date.parse(current) : Number.NaN;
    return Number.isFinite(nextTime) && Number.isFinite(currentTime) && nextTime > currentTime;
  },
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_COLLAB_NOTES: true } }));

const noteState = vi.hoisted(() => ({
  data: {
    id: 5,
    title: "旧标题",
    content: "# 旧标题\n\n正文",
    updateTime: "2026-11-22T09:00:00.000Z",
    knowledgeBaseId: 3,
    knowledgeBaseName: "复习库",
    notePermissions: 0,
  },
  refetch: vi.fn(),
}));
vi.mock("@/features/notes/use-note", () => ({
  useNoteQuery: () => ({
    data: noteState.data,
    error: null,
    isError: false,
    isPending: false,
    isFetching: false,
    refetch: noteState.refetch,
  }),
}));

const titleState = vi.hoisted(() => ({
  onEditorReady: vi.fn(),
  getTitleForContent: vi.fn(() => "标题"),
  setTitle: vi.fn(),
}));
vi.mock("@/features/notes/use-note-title", () => ({
  useNoteTitle: () => ({
    title: "标题",
    setTitle: titleState.setTitle,
    onEditorReady: titleState.onEditorReady,
    getTitleForContent: titleState.getTitleForContent,
  }),
}));

const saveState = vi.hoisted(() => ({
  scheduleSave: vi.fn(),
  flush: vi.fn(async () => undefined),
  retry: vi.fn(async () => undefined),
  getStatus: vi.fn(() => "saved" as const),
  hasPendingChanges: vi.fn(() => false),
  applyServerVersion: vi.fn(() => true),
  resolveConflict: vi.fn(),
}));
vi.mock("@/features/notes/use-save-note", () => ({
  COLLAB_AUTOSAVE_DEBOUNCE_MS: 3000,
  UNSAVED_LEAVE_MESSAGE: "改动尚未保存，离开后会丢失。确定离开吗？",
  hasUnsavedRisk: (status: string) =>
    status === "offline" || status === "error" || status === "failed" || status === "conflict",
  useSaveNote: () => ({
    ...saveState,
    status: "saved",
    lastSavedAt: null,
    conflict: null,
    failure: null,
  }),
}));

vi.mock("@/features/collab/use-collab-note", () => ({
  useCollabNote: () => ({
    active: false,
    serverPersist: false,
    savedVersion: null,
    publishSavedVersion: vi.fn(),
    leaveGuard: { active: false, message: "" },
    degraded: false,
    contentReady: true,
    editable: true,
    peers: [],
    connected: false,
    syncStatus: "saved",
    editedWhileOffline: false,
    hasLocalPersistence: false,
    fatal: null,
    reconnect: vi.fn(),
  }),
}));
vi.mock("@/features/notes/use-leave-guard", () => ({ useLeaveGuard: vi.fn() }));
vi.mock("@/features/notes/use-save-shortcut", () => ({ useSaveShortcut: vi.fn() }));

import { useNoteEditorSession } from "@/features/notes/use-note-editor-session";
import { renderHookWithProviders } from "@/test/render";

/**
 * 笔记编辑会话的定位与外部改动同步测试。
 *
 * @author 称霸幼儿园
 */
function fakeEditor() {
  return {
    isDestroyed: false,
    on: vi.fn(),
    off: vi.fn(),
    commands: { setContent: vi.fn() },
  } as unknown as Editor;
}

beforeEach(() => {
  scroll.mockClear();
  noteState.refetch.mockReset();
  saveState.getStatus.mockReturnValue("saved");
  saveState.hasPendingChanges.mockReturnValue(false);
  saveState.applyServerVersion.mockClear();
  noteState.data.notePermissions = 0;
});

describe("useNoteEditorSession", () => {
  /** 传入定位时按导航版本滚动，版本变化后重新定位。 */
  it("按定位与导航版本滚动", async () => {
    const editor = fakeEditor();
    const { result, rerender } = renderHookWithProviders(
      (props: { locate: { section: string; revision: number } }) =>
        useNoteEditorSession(5, { locate: props.locate }),
      { initialProps: { locate: { section: "第一章", revision: 1 } } },
    );

    act(() => result.current.handleEditorReady(editor));
    await waitFor(() =>
      expect(scroll).toHaveBeenCalledWith(
        editor,
        { section: "第一章", revision: 1 },
        "# 旧标题\n\n正文",
      ),
    );

    rerender({ locate: { section: "第二章", revision: 2 } });
    await waitFor(() =>
      expect(scroll).toHaveBeenLastCalledWith(
        editor,
        { section: "第二章", revision: 2 },
        "# 旧标题\n\n正文",
      ),
    );
  });

  /** 窗口重新可见且保存空闲时用服务端新版本替换正文。 */
  it("可见时同步服务端更新", async () => {
    noteState.refetch.mockResolvedValue({
      data: {
        ...noteState.data,
        title: "新标题",
        content: "# 新标题\n\n新正文",
        updateTime: "2026-11-22T10:00:00.000Z",
      },
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });

    renderHookWithProviders(() => useNoteEditorSession(5, { syncOnVisible: true }));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() =>
      expect(saveState.applyServerVersion).toHaveBeenCalledWith({
        title: "新标题",
        content: "# 新标题\n\n新正文",
        version: String(Date.parse("2026-11-22T10:00:00.000Z")),
        updateTime: "2026-11-22T10:00:00.000Z",
      }),
    );
  });

  /** 有待保存改动时不替换。 */
  it("有待保存改动时不同步", async () => {
    noteState.refetch.mockResolvedValue({
      data: { ...noteState.data, updateTime: "2026-11-22T10:00:00.000Z" },
    });
    saveState.hasPendingChanges.mockReturnValue(true);

    renderHookWithProviders(() => useNoteEditorSession(5, { syncOnVisible: true }));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(noteState.refetch).not.toHaveBeenCalled();
    expect(saveState.applyServerVersion).not.toHaveBeenCalled();
  });

  /** 协同模式下不替换。 */
  it("协同时不同步", async () => {
    noteState.data.notePermissions = 6;
    noteState.refetch.mockResolvedValue({
      data: { ...noteState.data, updateTime: "2026-11-22T10:00:00.000Z" },
    });

    renderHookWithProviders(() => useNoteEditorSession(5, { syncOnVisible: true }));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(noteState.refetch).not.toHaveBeenCalled();
    expect(saveState.applyServerVersion).not.toHaveBeenCalled();
  });

  /** 服务端更新时间不新时不替换。 */
  it("服务端版本不新时不同步", async () => {
    noteState.refetch.mockResolvedValue({ data: noteState.data });

    renderHookWithProviders(() => useNoteEditorSession(5, { syncOnVisible: true }));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(saveState.applyServerVersion).not.toHaveBeenCalled();
  });
});
