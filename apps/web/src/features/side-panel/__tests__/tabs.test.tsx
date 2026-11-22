import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const docState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/ai/use-docs", () => ({ useDocQuery: () => docState.current }));
const baseState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: () => baseState.current,
}));
const notesState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/notes/use-notes", () => ({ useNotesQuery: () => notesState.current }));
const docsState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/notes/use-docs", () => ({
  useKnowledgeBaseDocsQuery: () => docsState.current,
}));
const adminState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const memberState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/tasks/use-task-detail", () => ({
  useAdminTaskQuery: vi.fn(() => adminState.current),
  useMemberTaskByIdQuery: vi.fn(() => memberState.current),
  isTaskMissing: () => false,
}));
const moocItemState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const objectUrlState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/features/mooc/use-moocs", () => ({
  useMoocItemQuery: () => moocItemState.current,
  useObjectUrlQuery: () => objectUrlState.current,
}));
vi.mock("@/features/ai/components/pdf/pdf-viewer", () => ({
  PdfViewer: ({ page, navigationKey }: { page?: number; navigationKey?: number }) => (
    <div data-testid="pdf-viewer" data-page={page} data-navigation={navigationKey} />
  ),
}));
vi.mock("@/features/mooc/components/video-player", () => ({
  VideoPlayer: ({ startTime, navigationKey }: { startTime?: number; navigationKey?: number }) => (
    <div data-testid="video-player" data-start={startTime} data-navigation={navigationKey} />
  ),
}));
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value, preset }: { value: string; preset: string }) => (
    <div data-testid="tiptap" data-preset={preset}>
      {value}
    </div>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { DocTabBody } from "@/features/side-panel/tabs/doc/body";
import { KbTabBody } from "@/features/side-panel/tabs/kb/body";
import { MoocItemTabBody } from "@/features/side-panel/tabs/mooc-item/body";
import { UNREADABLE_TITLE } from "@/features/side-panel/tabs/shared";
import { TaskTabBody } from "@/features/side-panel/tabs/task/body";
import type { TabBodyActions, TabBodyProps, TabId } from "@/features/side-panel/types";
import { useAdminTaskQuery, useMemberTaskByIdQuery } from "@/features/tasks/use-task-detail";
import { ApiError } from "@/lib/api/errors";
import { renderWithProviders } from "@/test/render";

/**
 * 只读资源正文测试。
 *
 * @author 称霸幼儿园
 */
function actions(): TabBodyActions {
  return {
    openResource: vi.fn(),
    close: vi.fn(),
    registerGuard: vi.fn(() => vi.fn()),
    registerNewWindow: vi.fn(() => vi.fn()),
  };
}

function props(
  record: TabBodyProps["record"],
  locator: TabBodyProps["navigation"]["locator"] = {},
  revision = 1,
): TabBodyProps {
  return {
    record,
    navigation: { locator, revision },
    variant: "desktop",
    actions: actions(),
  };
}

const adminQuery = vi.mocked(useAdminTaskQuery);
const memberQuery = vi.mocked(useMemberTaskByIdQuery);

beforeEach(() => {
  adminQuery.mockClear();
  memberQuery.mockClear();
  docState.current = {
    data: { id: 7, docName: "资料.pdf", url: "https://x/doc.pdf", indexStatus: 0 },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  baseState.current = {
    data: { id: 3, knowledgeBaseName: "复习库", detail: "简介", permissions: 2 },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  notesState.current = {
    data: { rows: [{ id: 5, title: "复习笔记", updateTime: "2026-11-22T09:00:00.000Z" }] },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  docsState.current = {
    data: { rows: [{ id: 7, docName: "资料.pdf", indexStatus: 0 }] },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  adminState.current = {
    data: {
      id: 4,
      taskName: "期末任务",
      taskDescribe: "任务说明",
      startTime: "2020-01-01T00:00:00.000Z",
      endTime: "2030-01-01T00:00:00.000Z",
    },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  memberState.current = {
    data: {
      id: 4,
      taskName: "期末任务",
      taskDescribe: "任务说明",
      startTime: "2020-01-01T00:00:00.000Z",
      endTime: "2030-01-01T00:00:00.000Z",
      submissionStatus: 1,
    },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  moocItemState.current = {
    data: {
      id: 9,
      title: "第一讲",
      moocItemType: 1,
      objectName: "video.mp4",
      moocItemText: null,
    },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
  objectUrlState.current = {
    data: { url: "https://x/video.mp4" },
    isPending: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };
});

describe("只读资源正文", () => {
  /** 资料页码与导航版本传给 PDF 预览，新窗口地址带页码。 */
  it("资料按页码定位", async () => {
    renderWithProviders(
      <DocTabBody
        {...props(
          {
            id: "t1" as TabId,
            kind: "doc",
            family: "resource",
            ref: { type: "doc", id: 7, kbId: 3 },
          },
          { page: 4 },
          2,
        )}
      />,
    );
    const viewer = await screen.findByTestId("pdf-viewer");
    expect(viewer).toHaveAttribute("data-page", "4");
    expect(viewer).toHaveAttribute("data-navigation", "2");
    expect(screen.getByRole("link", { name: "在新窗口打开" })).toHaveAttribute(
      "href",
      "/ai/pdf?baseId=3&docId=7&page=4",
    );
  });

  /** 不存在与无权限共用不可读文案；网络错误给重试。 */
  it("资料不可读与加载失败", async () => {
    docState.current = {
      ...docState.current,
      data: undefined,
      isError: true,
      error: new ApiError(200, "A0301", "没有权限"),
    };
    const view = renderWithProviders(
      <DocTabBody
        {...props({
          id: "t1" as TabId,
          kind: "doc",
          family: "resource",
          ref: { type: "doc", id: 7, kbId: 3 },
        })}
      />,
    );
    expect(screen.getByText(UNREADABLE_TITLE)).toBeVisible();

    const refetch = vi.fn();
    docState.current = {
      ...docState.current,
      error: new ApiError(500, "B0001", "服务错误"),
      refetch,
    };
    view.rerender(
      <DocTabBody
        {...props({
          id: "t1" as TabId,
          kind: "doc",
          family: "resource",
          ref: { type: "doc", id: 7, kbId: 3 },
        })}
      />,
    );
    expect(screen.getByText("加载失败，请稍后重试")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  /** 知识库正文列出最近笔记与资料，点条目在侧栏打开。 */
  it("知识库正文打开条目", async () => {
    const bodyProps = props({
      id: "t1" as TabId,
      kind: "kb",
      family: "resource",
      ref: { type: "kb", id: 3 },
    });
    renderWithProviders(<KbTabBody {...bodyProps} />);
    expect(screen.getByText("复习笔记")).toBeVisible();
    expect(screen.getByText("资料.pdf")).toBeVisible();
    fireEvent.click(screen.getByTestId("side-panel-kb-note-5"));
    expect(bodyProps.actions.openResource).toHaveBeenCalledWith({
      ref: { type: "note", id: 5, kbId: 3 },
      locator: {},
      hint: { title: "复习笔记", kbName: "复习库" },
    });
  });

  /** 知识库空态使用已确认文案。 */
  it("知识库空态", () => {
    notesState.current = { ...notesState.current, data: { rows: [] } };
    docsState.current = { ...docsState.current, data: { rows: [] } };
    renderWithProviders(
      <KbTabBody
        {...props({
          id: "t1" as TabId,
          kind: "kb",
          family: "resource",
          ref: { type: "kb", id: 3 },
        })}
      />,
    );
    expect(screen.getByText("这个知识库还没有笔记")).toBeVisible();
    expect(screen.getByText("这个知识库还没有资料")).toBeVisible();
  });

  /** 成员视角使用单条端点，管理员视角使用管理端点。 */
  it("任务按权限选择数据源", () => {
    const member = renderWithProviders(
      <TaskTabBody
        {...props({
          id: "t1" as TabId,
          kind: "task",
          family: "resource",
          ref: { type: "task", id: 4, kbId: 3 },
        })}
      />,
    );
    expect(screen.getAllByText("期末任务").length).toBeGreaterThan(0);
    expect(screen.getByText("任务说明")).toBeVisible();
    expect(adminQuery).toHaveBeenLastCalledWith(4, { enabled: false });
    expect(memberQuery).toHaveBeenLastCalledWith(4, { enabled: true });
    member.unmount();

    baseState.current = {
      ...baseState.current,
      data: { ...(baseState.current.data as Record<string, unknown>), permissions: 1 },
    };
    renderWithProviders(
      <TaskTabBody
        {...props({
          id: "t1" as TabId,
          kind: "task",
          family: "resource",
          ref: { type: "task", id: 4, kbId: 3 },
        })}
      />,
    );
    expect(screen.getAllByText("期末任务").length).toBeGreaterThan(0);
    expect(adminQuery).toHaveBeenLastCalledWith(4, { enabled: true });
    expect(memberQuery).toHaveBeenLastCalledWith(4, { enabled: false });
  });

  /** 视频条目把秒数与导航版本传给播放器。 */
  it("慕课条目视频定位", async () => {
    renderWithProviders(
      <MoocItemTabBody
        {...props(
          {
            id: "t1" as TabId,
            kind: "mooc_item",
            family: "resource",
            ref: { type: "mooc_item", id: 9, kbId: 3, moocId: 8 },
          },
          { seconds: 12.345 },
          3,
        )}
      />,
    );
    const player = await screen.findByTestId("video-player");
    expect(player).toHaveAttribute("data-start", "12.345");
    expect(player).toHaveAttribute("data-navigation", "3");
    expect(screen.getByRole("link", { name: "在新窗口打开" })).toHaveAttribute(
      "href",
      "/notes/3/mooc/8?itemId=9&t=12.345",
    );
  });

  /** 文档类条目只读渲染正文。 */
  it("慕课条目文档正文", async () => {
    moocItemState.current = {
      ...moocItemState.current,
      data: {
        id: 9,
        title: "讲义",
        moocItemType: 2,
        objectName: null,
        moocItemText: { content: "# 讲义" },
      },
    };
    renderWithProviders(
      <MoocItemTabBody
        {...props({
          id: "t1" as TabId,
          kind: "mooc_item",
          family: "resource",
          ref: { type: "mooc_item", id: 9, kbId: 3, moocId: 8 },
        })}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("tiptap")).toHaveAttribute("data-preset", "readonly"),
    );
    expect(screen.getByText("# 讲义")).toBeVisible();
  });
});
