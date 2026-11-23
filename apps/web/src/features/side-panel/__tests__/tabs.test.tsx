import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const noteGet = vi.hoisted(() => vi.fn());
const notePost = vi.hoisted(() => vi.fn());
const fileGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/openapi", () => ({
  aiApi: { GET: vi.fn() },
  noteApi: { GET: noteGet, POST: notePost },
  fileApi: { GET: fileGet },
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
import { MoocTabBody } from "@/features/side-panel/tabs/mooc/body";
import { LOAD_FAILED, UNREADABLE_TITLE } from "@/features/side-panel/tabs/shared";
import { TaskTabBody } from "@/features/side-panel/tabs/task/body";
import type { TabBodyActions, TabBodyProps, TabId } from "@/features/side-panel/types";
import { renderWithProviders } from "@/test/render";

/**
 * 只读资源正文测试：在 openapi-fetch 客户端层打桩。
 *
 * @author 称霸幼儿园
 */
type Responder = (options: unknown) => { response: Response } | Promise<{ response: Response }>;
type Routes = Record<string, Responder>;

const DOC = {
  id: 7,
  docName: "资料.pdf",
  url: "https://x/doc.pdf",
  indexStatus: 0,
  knowledgeBaseId: 3,
};
const BASE = { id: 3, knowledgeBaseName: "复习库", detail: "简介", permissions: 2 };
const NOTES = {
  current: 1,
  pages: 1,
  total: 1,
  rows: [
    {
      id: 5,
      title: "复习笔记",
      updateTime: "2026-11-22T09:00:00.000Z",
      latestOperationTime: null,
    },
  ],
};
const DOCS = {
  current: 1,
  pages: 1,
  total: 1,
  rows: [{ id: 7, docName: "资料.pdf", indexStatus: 0 }],
};
const MOOC = {
  id: 8,
  title: "课程一",
  moocDescription: "课程简介",
  moocKnowledgeBaseName: "复习库",
};
const TOP_ITEMS = {
  current: 1,
  pages: 1,
  total: 2,
  rows: [
    { id: 10, title: "第一章", moocItemType: 0, parentId: 0 },
    { id: 9, title: "第一讲", moocItemType: 1, parentId: 0, objectName: "video.mp4" },
  ],
};
const CHILD_ITEMS = {
  current: 1,
  pages: 1,
  total: 1,
  rows: [{ id: 11, title: "第一节", moocItemType: 1, parentId: 10, objectName: "video2.mp4" }],
};
const ITEM_VIDEO = {
  id: 9,
  title: "第一讲",
  moocItemType: 1,
  objectName: "video.mp4",
  moocItemText: null,
};
const ITEM_DOC = {
  id: 9,
  title: "讲义",
  moocItemType: 2,
  objectName: null,
  moocItemText: { content: "# 讲义" },
};
const OBJECT_URL = { url: "https://x/video.mp4" };
const ADMIN_TASK = {
  id: 4,
  taskName: "期末任务",
  taskDescribe: "任务说明",
  startTime: "2020-01-01T00:00:00.000Z",
  endTime: "2030-01-01T00:00:00.000Z",
};
const MEMBER_TASK = { ...ADMIN_TASK, taskName: "成员任务", submissionStatus: 1 };

function ok(data: unknown) {
  return {
    response: new Response(JSON.stringify({ code: "00000", msg: "操作成功", data })),
  };
}

function fail(code: string, msg: string, status = 200) {
  return { response: new Response(JSON.stringify({ code, msg }), { status }) };
}

function networkError(): never {
  throw new TypeError("Failed to fetch");
}

function pending(): Promise<never> {
  return new Promise(() => {});
}

function parentId(options: unknown): number | undefined {
  const params = (
    options as {
      params?: { query?: { moocItemListDTO?: { parentId?: number } } };
    }
  ).params;
  return params?.query?.moocItemListDTO?.parentId;
}

let routes: { noteGet: Routes; notePost: Routes; fileGet: Routes };

beforeEach(() => {
  noteGet.mockReset();
  notePost.mockReset();
  fileGet.mockReset();
  routes = {
    noteGet: {
      "/docs/{id}": () => ok(DOC),
      "/docs": () => ok(DOCS),
      "/bases/{id}": () => ok(BASE),
      "/moocs/{id}": () => ok(MOOC),
      "/moocs/items": (options) => ok(parentId(options) === 0 ? TOP_ITEMS : CHILD_ITEMS),
      "/moocs/items/{moocItemId}": () => ok(ITEM_VIDEO),
      "/admin/noteTasks/{id}": () => ok(ADMIN_TASK),
      "/noteTasks/{id}": () => ok(MEMBER_TASK),
    },
    notePost: { "/notes/bases/{baseId}": () => ok(NOTES) },
    fileGet: { "/public/byObjectName": () => ok(OBJECT_URL) },
  };
  noteGet.mockImplementation((path: string, options: unknown) => {
    const responder = routes.noteGet[path];
    if (!responder) throw new Error(`未打桩的 GET：${path}`);
    return responder(options);
  });
  notePost.mockImplementation((path: string, options: unknown) => {
    const responder = routes.notePost[path];
    if (!responder) throw new Error(`未打桩的 POST：${path}`);
    return responder(options);
  });
  fileGet.mockImplementation((path: string, options: unknown) => {
    const responder = routes.fileGet[path];
    if (!responder) throw new Error(`未打桩的 file GET：${path}`);
    return responder(options);
  });
});

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

const docRecord = {
  id: "t1" as TabId,
  kind: "doc",
  family: "resource" as const,
  ref: { type: "doc" as const, id: 7, kbId: 3 },
};
const kbRecord = {
  id: "t1" as TabId,
  kind: "kb",
  family: "resource" as const,
  ref: { type: "kb" as const, id: 3 },
};
const moocRecord = {
  id: "t1" as TabId,
  kind: "mooc",
  family: "resource" as const,
  ref: { type: "mooc" as const, id: 8, kbId: 3 },
};
const moocItemRecord = {
  id: "t1" as TabId,
  kind: "mooc_item",
  family: "resource" as const,
  ref: { type: "mooc_item" as const, id: 9, kbId: 3, moocId: 8 },
};
const taskRecord = {
  id: "t1" as TabId,
  kind: "task",
  family: "resource" as const,
  ref: { type: "task" as const, id: 4, kbId: 3 },
};

function calls(mock: typeof noteGet, path: string): number {
  return mock.mock.calls.filter(([value]) => value === path).length;
}

describe("资料标签", () => {
  /** 资料按页码与导航版本定位，新窗口地址带页码。 */
  it("按页码定位", async () => {
    renderWithProviders(<DocTabBody {...props(docRecord, { page: 4 }, 2)} />);
    const viewer = await screen.findByTestId("pdf-viewer");
    expect(viewer).toHaveAttribute("data-page", "4");
    expect(viewer).toHaveAttribute("data-navigation", "2");
    expect(screen.getByRole("link", { name: "在新窗口打开" })).toHaveAttribute(
      "href",
      "/ai/pdf?baseId=3&docId=7&page=4",
    );
  });

  /** 详情未返回时显示文档骨架。 */
  it("加载时显示文档骨架", () => {
    routes.noteGet["/docs/{id}"] = () => pending();
    renderWithProviders(<DocTabBody {...props(docRecord)} />);
    expect(document.querySelector('[data-slot="skeleton-document"]')).not.toBeNull();
  });

  /** 不存在与无权限共用不可读文案。 */
  it("不可读", async () => {
    routes.noteGet["/docs/{id}"] = () => fail("A0301", "没有权限");
    renderWithProviders(<DocTabBody {...props(docRecord)} />);
    expect(await screen.findByText(UNREADABLE_TITLE)).toBeVisible();
  });

  /** 网络错误给重试，重试重新请求。 */
  it("网络错误重试", async () => {
    routes.noteGet["/docs/{id}"] = networkError;
    renderWithProviders(<DocTabBody {...props(docRecord)} />);
    expect(await screen.findByText(LOAD_FAILED)).toBeVisible();
    const before = calls(noteGet, "/docs/{id}");
    routes.noteGet["/docs/{id}"] = () => ok(DOC);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(calls(noteGet, "/docs/{id}")).toBe(before + 1));
    expect(await screen.findByTestId("pdf-viewer")).toBeVisible();
  });
});

describe("知识库标签", () => {
  /** 最近笔记与资料各列 5 条，点条目在侧栏打开。 */
  it("列出条目并在侧栏打开", async () => {
    const bodyProps = props(kbRecord);
    renderWithProviders(<KbTabBody {...bodyProps} />);
    expect(await screen.findByText("复习笔记")).toBeVisible();
    expect(screen.getByText("资料.pdf")).toBeVisible();

    fireEvent.click(screen.getByTestId("side-panel-kb-note-5"));
    expect(bodyProps.actions.openResource).toHaveBeenCalledWith({
      ref: { type: "note", id: 5, kbId: 3 },
      locator: {},
      hint: { title: "复习笔记", kbName: "复习库" },
    });

    fireEvent.click(screen.getByTestId("side-panel-kb-doc-7"));
    expect(bodyProps.actions.openResource).toHaveBeenCalledWith({
      ref: { type: "doc", id: 7, kbId: 3 },
      locator: {},
      hint: { title: "资料.pdf", kbName: "复习库" },
    });
  });

  /** 知识库详情未返回时显示面板骨架。 */
  it("加载时显示面板骨架", () => {
    routes.noteGet["/bases/{id}"] = () => pending();
    renderWithProviders(<KbTabBody {...props(kbRecord)} />);
    expect(document.querySelector('[data-slot="skeleton-panel"]')).not.toBeNull();
  });

  /** 不存在与无权限共用不可读文案。 */
  it("不可读", async () => {
    routes.noteGet["/bases/{id}"] = () => fail("A0301", "没有权限");
    renderWithProviders(<KbTabBody {...props(kbRecord)} />);
    expect(await screen.findByText(UNREADABLE_TITLE)).toBeVisible();
  });

  /** 网络错误给重试。 */
  it("网络错误重试", async () => {
    routes.noteGet["/bases/{id}"] = networkError;
    renderWithProviders(<KbTabBody {...props(kbRecord)} />);
    expect(await screen.findByText(LOAD_FAILED)).toBeVisible();
    const before = calls(noteGet, "/bases/{id}");
    routes.noteGet["/bases/{id}"] = () => ok(BASE);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(calls(noteGet, "/bases/{id}")).toBe(before + 1));
  });

  /** 两个预览区为空时使用已确认文案。 */
  it("空态", async () => {
    routes.notePost["/notes/bases/{baseId}"] = () => ok({ ...NOTES, rows: [] });
    routes.noteGet["/docs"] = () => ok({ ...DOCS, rows: [] });
    renderWithProviders(<KbTabBody {...props(kbRecord)} />);
    expect(await screen.findByText("这个知识库还没有笔记")).toBeVisible();
    expect(screen.getByText("这个知识库还没有资料")).toBeVisible();
  });

  /** 子列表失败只影响该区块，重试重新请求。 */
  it("笔记列表异常重试", async () => {
    routes.notePost["/notes/bases/{baseId}"] = networkError;
    renderWithProviders(<KbTabBody {...props(kbRecord)} />);
    expect(await screen.findByText(LOAD_FAILED)).toBeVisible();
    expect(screen.getByText("资料.pdf")).toBeVisible();
    const before = calls(notePost, "/notes/bases/{baseId}");
    routes.notePost["/notes/bases/{baseId}"] = () => ok(NOTES);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(calls(notePost, "/notes/bases/{baseId}")).toBe(before + 1));
  });
});

describe("慕课标签", () => {
  /** 目录展开后加载子条目，点可播放条目在侧栏打开。 */
  it("目录展开与条目打开", async () => {
    const bodyProps = props(moocRecord);
    renderWithProviders(<MoocTabBody {...bodyProps} />);
    expect(await screen.findByText("课程一")).toBeVisible();
    expect(screen.getByText("课程简介")).toBeVisible();
    expect(screen.getByText("课程目录")).toBeVisible();

    fireEvent.click(screen.getByTestId("side-panel-mooc-item-9"));
    expect(bodyProps.actions.openResource).toHaveBeenCalledWith({
      ref: { type: "mooc_item", id: 9, kbId: 3, moocId: 8 },
      locator: {},
      hint: { title: "第一讲", kbName: "复习库" },
    });

    fireEvent.click(screen.getByRole("button", { name: "展开章节" }));
    expect(await screen.findByText("第一节")).toBeVisible();
    fireEvent.click(screen.getByTestId("side-panel-mooc-item-11"));
    expect(bodyProps.actions.openResource).toHaveBeenCalledWith({
      ref: { type: "mooc_item", id: 11, kbId: 3, moocId: 8 },
      locator: {},
      hint: { title: "第一节", kbName: "复习库" },
    });
  });

  /** 目录加载时显示骨架。 */
  it("目录加载骨架", () => {
    routes.noteGet["/moocs/items"] = () => pending();
    renderWithProviders(<MoocTabBody {...props(moocRecord)} />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  /** 课程不存在与无权限共用不可读文案。 */
  it("课程不可读", async () => {
    routes.noteGet["/moocs/{id}"] = () => fail("A0301", "没有权限");
    renderWithProviders(<MoocTabBody {...props(moocRecord)} />);
    expect(await screen.findByText(UNREADABLE_TITLE)).toBeVisible();
  });

  /** 课程网络错误给重试。 */
  it("课程网络错误重试", async () => {
    routes.noteGet["/moocs/{id}"] = networkError;
    renderWithProviders(<MoocTabBody {...props(moocRecord)} />);
    expect(await screen.findByText(LOAD_FAILED)).toBeVisible();
    const before = calls(noteGet, "/moocs/{id}");
    routes.noteGet["/moocs/{id}"] = () => ok(MOOC);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(calls(noteGet, "/moocs/{id}")).toBe(before + 1));
  });

  /** 目录失败给重试，重试重新请求。 */
  it("目录异常重试", async () => {
    routes.noteGet["/moocs/items"] = networkError;
    renderWithProviders(<MoocTabBody {...props(moocRecord)} />);
    expect(await screen.findByText(LOAD_FAILED)).toBeVisible();
    const before = calls(noteGet, "/moocs/items");
    routes.noteGet["/moocs/items"] = () => ok(TOP_ITEMS);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(calls(noteGet, "/moocs/items")).toBe(before + 1));
  });

  /** 空目录使用已确认文案。 */
  it("空目录", async () => {
    routes.noteGet["/moocs/items"] = () => ok({ ...TOP_ITEMS, rows: [] });
    renderWithProviders(<MoocTabBody {...props(moocRecord)} />);
    expect(await screen.findByText("这门课还没有章节内容")).toBeVisible();
  });
});

describe("慕课条目标签", () => {
  /** 视频把秒数与导航版本传给播放器，新窗口地址带时间点。 */
  it("视频按秒数定位", async () => {
    renderWithProviders(<MoocItemTabBody {...props(moocItemRecord, { seconds: 12.345 }, 3)} />);
    const player = await screen.findByTestId("video-player");
    expect(player).toHaveAttribute("data-start", "12.345");
    expect(player).toHaveAttribute("data-navigation", "3");
    expect(screen.getByRole("link", { name: "在新窗口打开" })).toHaveAttribute(
      "href",
      "/notes/3/mooc/8?itemId=9&t=12.345",
    );
  });

  /** 文档类条目只读渲染正文。 */
  it("文档条目只读正文", async () => {
    routes.noteGet["/moocs/items/{moocItemId}"] = () => ok(ITEM_DOC);
    renderWithProviders(<MoocItemTabBody {...props(moocItemRecord)} />);
    await waitFor(() =>
      expect(screen.getByTestId("tiptap")).toHaveAttribute("data-preset", "readonly"),
    );
    expect(screen.getByText("# 讲义")).toBeVisible();
  });

  /** 条目详情未返回时显示骨架。 */
  it("加载骨架", () => {
    routes.noteGet["/moocs/items/{moocItemId}"] = () => pending();
    renderWithProviders(<MoocItemTabBody {...props(moocItemRecord)} />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  /** 不存在与无权限共用不可读文案。 */
  it("不可读", async () => {
    routes.noteGet["/moocs/items/{moocItemId}"] = () => fail("A0301", "没有权限");
    renderWithProviders(<MoocItemTabBody {...props(moocItemRecord)} />);
    expect(await screen.findByText(UNREADABLE_TITLE)).toBeVisible();
  });

  /** 网络错误给重试。 */
  it("网络错误重试", async () => {
    routes.noteGet["/moocs/items/{moocItemId}"] = networkError;
    renderWithProviders(<MoocItemTabBody {...props(moocItemRecord)} />);
    expect(await screen.findByText(LOAD_FAILED)).toBeVisible();
    const before = calls(noteGet, "/moocs/items/{moocItemId}");
    routes.noteGet["/moocs/items/{moocItemId}"] = () => ok(ITEM_VIDEO);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(calls(noteGet, "/moocs/items/{moocItemId}")).toBe(before + 1));
  });

  /** 播放地址失败给重试，重试重新请求 file 域。 */
  it("播放地址失败重试", async () => {
    routes.fileGet["/public/byObjectName"] = networkError;
    renderWithProviders(<MoocItemTabBody {...props(moocItemRecord)} />);
    expect(await screen.findByText(LOAD_FAILED)).toBeVisible();
    const before = calls(fileGet, "/public/byObjectName");
    routes.fileGet["/public/byObjectName"] = () => ok(OBJECT_URL);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(calls(fileGet, "/public/byObjectName")).toBe(before + 1));
    expect(await screen.findByTestId("video-player")).toBeVisible();
  });
});

describe("任务标签", () => {
  /** 成员视角使用单条端点，不请求管理端点。 */
  it("成员视角", async () => {
    renderWithProviders(<TaskTabBody {...props(taskRecord)} />);
    expect(await screen.findByRole("heading", { name: "成员任务", level: 3 })).toBeVisible();
    expect(screen.getByText("任务说明")).toBeVisible();
    expect(calls(noteGet, "/noteTasks/{id}")).toBe(1);
    expect(calls(noteGet, "/admin/noteTasks/{id}")).toBe(0);
  });

  /** 管理员视角渲染管理端点的数据。 */
  it("管理员视角", async () => {
    routes.noteGet["/bases/{id}"] = () => ok({ ...BASE, permissions: 1 });
    renderWithProviders(<TaskTabBody {...props(taskRecord)} />);
    expect(await screen.findByRole("heading", { name: "期末任务", level: 3 })).toBeVisible();
    expect(screen.queryByText("成员任务")).toBeNull();
    expect(calls(noteGet, "/admin/noteTasks/{id}")).toBe(1);
  });

  /** 知识库权限未返回时显示骨架。 */
  it("加载骨架", () => {
    routes.noteGet["/bases/{id}"] = () => pending();
    renderWithProviders(<TaskTabBody {...props(taskRecord)} />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  /** 任务不存在与无权限共用不可读文案。 */
  it("不可读", async () => {
    routes.noteGet["/noteTasks/{id}"] = () => fail("A0301", "没有权限");
    renderWithProviders(<TaskTabBody {...props(taskRecord)} />);
    expect(await screen.findByText(UNREADABLE_TITLE)).toBeVisible();
  });

  /** 网络错误给重试。 */
  it("网络错误重试", async () => {
    routes.noteGet["/noteTasks/{id}"] = networkError;
    renderWithProviders(<TaskTabBody {...props(taskRecord)} />);
    expect(await screen.findByText(LOAD_FAILED)).toBeVisible();
    const before = calls(noteGet, "/noteTasks/{id}");
    routes.noteGet["/noteTasks/{id}"] = () => ok(MEMBER_TASK);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(calls(noteGet, "/noteTasks/{id}")).toBe(before + 1));
  });
});
