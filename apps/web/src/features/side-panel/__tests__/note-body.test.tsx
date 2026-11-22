import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionHook = vi.hoisted(() => vi.fn());
vi.mock("@/features/notes/use-note-editor-session", () => ({
  useNoteEditorSession: sessionHook,
}));
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value, preset }: { value: string; preset: string }) => (
    <div data-testid="tiptap" data-preset={preset}>
      {value}
    </div>
  ),
}));
vi.mock("@/features/notes/components/collab-notices", () => ({
  CollabNotices: () => null,
}));
vi.mock("@/features/notes/components/collab-presence", () => ({
  CollabPresence: () => null,
}));
vi.mock("@/features/notes/components/mobile/note-editor-mobile-body", () => ({
  MobileNoteEditorBody: () => <div data-testid="mobile-note-body" />,
}));
vi.mock("@/components/note/save-status", () => ({
  SaveStatusBadge: () => <span data-testid="save-badge" />,
  CollabSyncBadge: () => <span data-testid="collab-badge" />,
  SaveFailureNotice: () => null,
}));
vi.mock("@/components/note/conflict-dialog", () => ({ ConflictDialog: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { NoteTabBody } from "@/features/side-panel/tabs/note/body";
import type { TabBodyActions, TabId } from "@/features/side-panel/types";
import { renderWithProviders } from "@/test/render";

/**
 * 笔记标签的守卫与新窗口流程测试。
 *
 * @author 称霸幼儿园
 */
const record = {
  id: "t1" as TabId,
  kind: "note",
  family: "resource" as const,
  ref: { type: "note" as const, id: 5, kbId: 3 },
};

function makeSession(hasPending: boolean) {
  const confirmLeave = vi.fn(() => true);
  return {
    note: {
      data: {
        id: 5,
        title: "复习笔记",
        knowledgeBaseName: "复习库",
        updateTime: "2026-11-22T09:00:00.000Z",
      },
      isError: false,
      isPending: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    },
    title: "复习笔记",
    initialContent: "# 复习笔记\n正文",
    charCount: 5,
    collabEnabled: false,
    collab: {
      active: false,
      serverPersist: false,
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
    },
    collaboration: undefined,
    serverPersist: false,
    save: {
      status: "saved",
      lastSavedAt: null,
      failure: null,
      conflict: null,
      hasPendingChanges: vi.fn(() => hasPending),
      flush: vi.fn(async () => undefined),
      retry: vi.fn(),
      resolveConflict: vi.fn(),
      applyServerVersion: vi.fn(),
    },
    handleContentChange: vi.fn(),
    handleEditorReady: vi.fn(),
    uploadFn: vi.fn(),
    confirmLeave,
  };
}

function actions(): TabBodyActions {
  return {
    openResource: vi.fn(),
    close: vi.fn(),
    registerGuard: vi.fn(() => vi.fn()),
    registerNewWindow: vi.fn(() => vi.fn()),
  };
}

beforeEach(() => {
  sessionHook.mockReset();
  sessionHook.mockImplementation(() => makeSession(false));
});

describe("笔记标签", () => {
  /** 登记离开守卫与新窗口处理器，定位参数带导航版本。 */
  it("登记守卫与新窗口处理器", () => {
    const bodyActions = actions();
    renderWithProviders(
      <NoteTabBody
        record={record}
        navigation={{ locator: { section: "第一章" }, revision: 2 }}
        variant="desktop"
        actions={bodyActions}
      />,
    );
    expect(sessionHook).toHaveBeenCalledWith(5, {
      locate: { section: "第一章", line: undefined, revision: 2 },
      syncOnVisible: true,
    });
    expect(bodyActions.registerGuard).toHaveBeenCalledWith(
      (sessionHook.mock.results[0]?.value as { confirmLeave: unknown }).confirmLeave,
    );
    expect(bodyActions.registerNewWindow).toHaveBeenCalled();
    expect(screen.getByTestId("tiptap")).toHaveAttribute("data-preset", "full");
  });

  /** 有待保存改动时先同步打开空白页，保存后替换地址。 */
  it("有待保存改动时先保存再打开新窗口", async () => {
    const session = makeSession(true);
    sessionHook.mockReturnValue(session);
    const fakeWindow = {
      opener: {} as unknown,
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, "open").mockReturnValue(fakeWindow as unknown as Window);

    renderWithProviders(
      <NoteTabBody
        record={record}
        navigation={{ locator: { section: "第一章" }, revision: 1 }}
        variant="desktop"
        actions={actions()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "在新窗口打开" }));

    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    await waitFor(() =>
      expect(fakeWindow.location.replace).toHaveBeenCalledWith(
        "/notes/3/5?section=%E7%AC%AC%E4%B8%80%E7%AB%A0",
      ),
    );
    expect(fakeWindow.opener).toBeNull();
    expect(session.save.flush).toHaveBeenCalledOnce();
    expect(session.confirmLeave).toHaveBeenCalledOnce();
  });

  /** 没有待保存改动时保留原生链接。 */
  it("无待保存改动时使用原生链接", () => {
    renderWithProviders(
      <NoteTabBody
        record={record}
        navigation={{ locator: { section: "第一章" }, revision: 1 }}
        variant="desktop"
        actions={actions()}
      />,
    );
    const link = screen.getByRole("link", { name: "在新窗口打开" });
    expect(link).toHaveAttribute("href", "/notes/3/5?section=%E7%AC%AC%E4%B8%80%E7%AB%A0");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  /** 移动端复用正文层，不渲染桌面标签头。 */
  it("移动端渲染正文层", () => {
    renderWithProviders(
      <NoteTabBody
        record={record}
        navigation={{ locator: {}, revision: 1 }}
        variant="mobile"
        actions={actions()}
      />,
    );
    expect(screen.getByTestId("mobile-note-body")).toBeVisible();
    expect(screen.queryByTestId("tiptap")).toBeNull();
  });
});
