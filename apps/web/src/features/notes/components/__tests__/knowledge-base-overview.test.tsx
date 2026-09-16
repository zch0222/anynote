import { useUIStore } from "@/stores/ui-store";
import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * D-02 概览页的单测。
 *
 * 被测组件订阅六棵查询（知识库详情 / 笔记 / 慕课 / 任务 / 资料 / 成员），
 * 这里全部在 hook 层打桩——不 mock 全局 fetch，也不起真实服务
 * （仓库前端测试约定，见 CLAUDE.md「前端：Vitest + Testing Library」）。
 */
const useKnowledgeBaseQuery = vi.fn();
const useKnowledgeBaseMembersQuery = vi.fn();
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: (...args: unknown[]) => useKnowledgeBaseQuery(...args),
  useKnowledgeBaseMembersQuery: (...args: unknown[]) => useKnowledgeBaseMembersQuery(...args),
}));

const useNotesQuery = vi.fn();
vi.mock("@/features/notes/use-notes", () => ({
  useNotesQuery: (...args: unknown[]) => useNotesQuery(...args),
}));

const useKnowledgeBaseDocsQuery = vi.fn();
vi.mock("@/features/notes/use-docs", () => ({
  useKnowledgeBaseDocsQuery: (...args: unknown[]) => useKnowledgeBaseDocsQuery(...args),
}));

const useMoocsQuery = vi.fn();
vi.mock("@/features/mooc/use-moocs", () => ({
  useMoocsQuery: (...args: unknown[]) => useMoocsQuery(...args),
}));

const useTasksQuery = vi.fn();
vi.mock("@/features/tasks/use-tasks", () => ({
  useTasksQuery: (...args: unknown[]) => useTasksQuery(...args),
}));

// CreateNoteDialog 内部要跳转（创建成功后去编辑页）
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/notes/5/overview",
}));

import {
  KnowledgeBaseOverview,
  OVERVIEW_DOC_PREVIEW,
  OVERVIEW_MEMBER_PREVIEW,
  OVERVIEW_NOTE_PREVIEW,
} from "../knowledge-base-overview";

const IDLE = { isPending: false, isError: false, isFetching: false, error: null };

/** 六棵查询的默认桩：库存在、权限管理员、各类内容为空。 */
function mockAll({
  base = {},
  notes = { rows: [], total: 0 },
  moocs = { rows: [], total: 0 },
  tasks = { rows: [], total: 0 },
  docs = { rows: [], total: 0 },
  members = { rows: [], total: 0 },
}: {
  base?: Record<string, unknown>;
  notes?: { rows: unknown[]; total: number };
  moocs?: { rows: unknown[]; total: number };
  tasks?: { rows: unknown[]; total: number };
  docs?: { rows: unknown[]; total: number };
  members?: { rows: unknown[]; total: number };
} = {}) {
  useKnowledgeBaseQuery.mockReturnValue({
    ...IDLE,
    data: {
      id: 5,
      knowledgeBaseName: "产品设计",
      detail: "产品设计团队的共享空间",
      type: 0,
      updateTime: "2026-09-16T02:00:00.000Z",
      permissions: 1,
      ...base,
    },
  });
  useNotesQuery.mockReturnValue({ ...IDLE, data: notes });
  useMoocsQuery.mockReturnValue({ ...IDLE, data: moocs });
  useTasksQuery.mockReturnValue({ ...IDLE, data: tasks });
  useKnowledgeBaseDocsQuery.mockReturnValue({ ...IDLE, data: docs });
  useKnowledgeBaseMembersQuery.mockReturnValue({ ...IDLE, data: members });
}

beforeEach(() => {
  mockAll();
});

describe("KnowledgeBaseOverview（D-02）头图卡片", () => {
  it("显示知识库名称、类型徽标、简介与「更新于…我的权限」元信息", () => {
    mockAll({ base: { permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByRole("heading", { level: 1, name: "产品设计" })).toBeInTheDocument();
    expect(screen.getByText("普通知识库")).toBeInTheDocument();
    expect(screen.getByText("产品设计团队的共享空间")).toBeInTheDocument();
    // permissions 1 → 管理员（图例 6 的文案口径）
    expect(screen.getByText(/我的权限：管理员/)).toBeInTheDocument();
  });

  it("组织知识库的类型徽标换成「组织知识库」", () => {
    mockAll({ base: { type: 1, permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByText("组织知识库")).toBeInTheDocument();
    expect(screen.queryByText("普通知识库")).toBeNull();
  });

  it("空名称回退「未命名知识库」，空简介回退占位文本", () => {
    mockAll({ base: { knowledgeBaseName: "   ", detail: "", permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByRole("heading", { level: 1, name: "未命名知识库" })).toBeInTheDocument();
    expect(screen.getByText("这个知识库还没有填写简介。")).toBeInTheDocument();
  });

  it("权限 1 / 2 显示「新建笔记」，权限 3 / 4 / 未知 隐藏", async () => {
    for (const [permissions, visible] of [
      [1, true],
      [2, true],
      [3, false],
      [4, false],
      [undefined, false],
    ] as const) {
      /*
       * 权限经 `base` 传而不是走 `mockAll` 的顶层参数：函数参数的默认值
       * 对 `undefined` 也生效（`permissions = 1`），顶层传 undefined 会被
       * 静默折成 1，测出来的是「管理员可见」——这条用例就永远绿了。
       */
      mockAll({ base: { permissions } });
      const { unmount } = renderWithProviders(<KnowledgeBaseOverview baseId={5} />);
      if (visible) {
        // 对话框走 dynamic(..., { ssr: false })，要等一拍才挂上（省首屏预算）
        expect(await screen.findByTestId("kb-overview-note-create")).toBeInTheDocument();
      } else {
        // 反向断言给一拍再查：立即查会因为"还没加载"而假通过，测不出权限逻辑
        await waitFor(() => {
          expect(screen.queryByTestId("kb-overview-note-create")).toBeNull();
        });
      }
      unmount();
    }
  });

  it("权限 2（可编辑）的元信息显示「可编辑」", () => {
    mockAll({ base: { permissions: 2 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByText(/我的权限：可编辑/)).toBeInTheDocument();
  });
});

/**
 * 动作行（图例 7 搜索 / 8 主题 / 9 新建笔记）。
 *
 * 这三个动作**只在这张卡片里**：概览页不渲染顶栏（`isKnowledgeBaseOverviewRoute`），
 * 所以它们必须是"这一页唯一的一份"。若哪天有人在页面里再加一个顶栏，
 * 这里断言 `getByRole`（单数）会立刻变成 strict mode violation 炸掉。
 */
describe("KnowledgeBaseOverview（D-02）头图卡片的动作行", () => {
  it("搜索按钮打开命令面板", () => {
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    const search = screen.getByTestId("kb-overview-search");
    expect(search).toHaveAttribute("aria-label", "打开命令面板");
    expect(search).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K");
    // 打开动作由 store 承担；面板本身在 AppShell 里，这个组件只负责派发
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    fireEvent.click(search);
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
  });

  it("主题切换按钮与搜索按钮同在一行，且各只有一个", () => {
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    // 单数查询：重复渲染会直接抛 strict mode violation
    expect(screen.getAllByRole("button", { name: "切换主题" })).toHaveLength(1);
    expect(screen.getAllByTestId("kb-overview-search")).toHaveLength(1);
  });

  it("新建笔记按钮（权限 1）与两个图标按钮同在动作行", async () => {
    mockAll({ base: { permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    const create = await screen.findByTestId("kb-overview-note-create");
    const hero = screen.getByTestId("kb-hero");
    expect(hero).toContainElement(create);
    expect(hero).toContainElement(screen.getByTestId("kb-overview-search"));
    expect(create).toHaveTextContent("新建笔记");
  });

  it("只读成员看不到主按钮，但搜索与主题仍在（这一页没有顶栏可退）", async () => {
    mockAll({ base: { permissions: 3 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    await waitFor(() => expect(screen.queryByTestId("kb-overview-note-create")).toBeNull());
    expect(screen.getByTestId("kb-overview-search")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
  });
});

describe("KnowledgeBaseOverview（D-02）内容概况 5 格", () => {
  it("5 格与侧栏二级导航一一对应，且各自指向对应 Tab", () => {
    mockAll({ base: { permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    const expected: readonly (readonly [string, string])[] = [
      ["notes", "/notes/5"],
      ["mooc", "/notes/5/mooc"],
      ["tasks", "/notes/5/tasks"],
      ["docs", "/notes/5/docs"],
      ["members", "/notes/5/members"],
    ];
    for (const [key, href] of expected) {
      expect(screen.getByTestId(`kb-stat-${key}`)).toHaveAttribute("href", href);
    }
  });

  it("每格显示各自列表的 total，且标签正确", () => {
    mockAll({
      base: { permissions: 1 },
      notes: { rows: [], total: 128 },
      moocs: { rows: [], total: 6 },
      tasks: { rows: [], total: 3 },
      docs: { rows: [], total: 9 },
      members: { rows: [], total: 12 },
    });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    for (const [key, total, label] of [
      ["notes", "128", "笔记"],
      ["mooc", "6", "慕课"],
      ["tasks", "3", "任务"],
      ["docs", "9", "资料"],
      ["members", "12", "成员"],
    ] as const) {
      expect(screen.getByTestId(`kb-stat-${key}`)).toHaveTextContent(total);
      expect(screen.getByTestId(`kb-stat-${key}`)).toHaveTextContent(label);
    }
  });

  it("Q-02：数据未到时给骨架而不是 0（先显示 0 等于说「这个库是空的」）", () => {
    useKnowledgeBaseQuery.mockReturnValue({
      ...IDLE,
      data: { id: 5, knowledgeBaseName: "产品设计", permissions: 1 },
    });
    useNotesQuery.mockReturnValue({ ...IDLE, isPending: true, data: undefined });
    useMoocsQuery.mockReturnValue({ ...IDLE, data: { rows: [], total: 0 } });
    useTasksQuery.mockReturnValue({ ...IDLE, data: { rows: [], total: 0 } });
    useKnowledgeBaseDocsQuery.mockReturnValue({ ...IDLE, data: { rows: [], total: 0 } });
    useKnowledgeBaseMembersQuery.mockReturnValue({ ...IDLE, data: { rows: [], total: 0 } });

    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    // 笔记格还没有数字（0 来自慕课/任务等真实返回，不算未加载）
    expect(screen.getByTestId("kb-stat-notes")).not.toHaveTextContent("0");
  });
});

describe("KnowledgeBaseOverview（D-02）预览块", () => {
  const NOTES = Array.from({ length: 8 }, (_, index) => ({
    id: 100 + index,
    title: `笔记 ${index + 1}`,
    latestOperationTime: "2026-09-16T01:00:00.000Z",
  }));
  const DOCS = Array.from({ length: 6 }, (_, index) => ({
    id: 200 + index,
    docName: `文档 ${index + 1}.pdf`,
    indexStatus: index === 0 ? 1 : 0,
    creatorNickname: "林一",
    createTime: "2026-09-15T01:00:00.000Z",
  }));
  const MEMBERS = Array.from({ length: 6 }, (_, index) => ({
    userId: 300 + index,
    username: `user${index + 1}`,
    nickname: `成员 ${index + 1}`,
    permissions: index === 0 ? 1 : index === 1 ? 2 : 3,
  }));

  it("最近笔记只取前 5 篇，每行指向笔记编辑器", () => {
    mockAll({ notes: { rows: NOTES, total: NOTES.length } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    const rows = screen.getByTestId("kb-preview-notes").querySelectorAll("a");
    expect(rows).toHaveLength(OVERVIEW_NOTE_PREVIEW);
    expect(screen.getByTestId("kb-preview-note-100")).toHaveAttribute("href", "/notes/5/100");
    // 第 6 篇起不进预览
    expect(screen.queryByTestId("kb-preview-note-105")).toBeNull();
  });

  it("资料只取前 3 份，索引状态徽标区分已索引 / 未索引", () => {
    mockAll({ docs: { rows: DOCS, total: DOCS.length } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    const list = screen.getByTestId("kb-preview-docs");
    expect(list.querySelectorAll("li")).toHaveLength(OVERVIEW_DOC_PREVIEW);
    expect(screen.getByTestId("kb-preview-doc-200")).toHaveTextContent("已索引");
    expect(screen.getByTestId("kb-preview-doc-201")).toHaveTextContent("未索引");
    expect(screen.queryByTestId("kb-preview-doc-203")).toBeNull();
  });

  it("资料行本身不可点（桌面暂无文档详情路由，图例 19）", () => {
    mockAll({ docs: { rows: DOCS, total: DOCS.length } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByTestId("kb-preview-doc-200").querySelector("a")).toBeNull();
  });

  it("成员只取前 3 位，权限徽标按档位取色", () => {
    mockAll({ members: { rows: MEMBERS, total: MEMBERS.length } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    const list = screen.getByTestId("kb-preview-members");
    expect(list.querySelectorAll("li")).toHaveLength(OVERVIEW_MEMBER_PREVIEW);
    expect(screen.getByTestId("kb-preview-member-300")).toHaveTextContent("管理员");
    expect(screen.getByTestId("kb-preview-member-301")).toHaveTextContent("可编辑");
    expect(screen.getByTestId("kb-preview-member-302")).toHaveTextContent("可阅读");
    expect(screen.queryByTestId("kb-preview-member-303")).toBeNull();
  });

  it("三个「全部 X」链接分别指向笔记 / 资料 / 成员 Tab", () => {
    mockAll();
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByRole("link", { name: "全部笔记" })).toHaveAttribute("href", "/notes/5");
    expect(screen.getByRole("link", { name: "全部资料" })).toHaveAttribute("href", "/notes/5/docs");
    expect(screen.getByRole("link", { name: "全部成员" })).toHaveAttribute(
      "href",
      "/notes/5/members",
    );
  });
});

describe("KnowledgeBaseOverview（D-02）空态与错误态", () => {
  it("资料块加载失败时按 Q-02 文案提示「找不到这个知识库」", () => {
    mockAll({ base: { permissions: 1 } });
    useKnowledgeBaseDocsQuery.mockReturnValue({
      ...IDLE,
      isError: true,
      error: new Error("boom"),
    });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByText("找不到这个知识库")).toBeInTheDocument();
  });

  it("资料块空态给「去上传」并带上 baseId", () => {
    mockAll({ base: { permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(
      screen.getByText("还没有资料。上传 PDF 后可以在「PDF 问答」里围绕它提问。"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kb-overview-docs-upload")).toHaveAttribute(
      "href",
      "/ai/pdf?baseId=5",
    );
  });

  it("笔记块空态给出「新建笔记」次按钮（有空态动作）", async () => {
    mockAll({ base: { permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByText("这个知识库还没有笔记")).toBeInTheDocument();
    expect(await screen.findByTestId("kb-overview-empty-create")).toBeInTheDocument();
  });

  it("只读成员的空态不给「新建笔记」次按钮", async () => {
    mockAll({ base: { permissions: 3 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    await waitFor(() => {
      expect(screen.queryByTestId("kb-overview-empty-create")).toBeNull();
    });
  });

  it("成员块空态给 Q-02 文案", () => {
    mockAll({ base: { permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByText("这个知识库还没有其他成员。")).toBeInTheDocument();
  });

  it("笔记块加载失败时同样是「找不到这个知识库」", () => {
    mockAll({ base: { permissions: 1 } });
    useNotesQuery.mockReturnValue({ ...IDLE, isError: true, error: new Error("boom") });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    expect(screen.getByText("找不到这个知识库")).toBeInTheDocument();
  });
});

describe("KnowledgeBaseOverview（D-02）请求复用", () => {
  it("5 格计数不新增请求：笔记 / 慕课 / 任务复用侧栏同一份查询参数", () => {
    mockAll({ base: { permissions: 1 } });
    renderWithProviders(<KnowledgeBaseOverview baseId={5} />);

    // 与侧栏 `KnowledgeBaseSidebar` 完全相同的调用形态（同一 query key 才会命中缓存）
    expect(useNotesQuery).toHaveBeenCalledWith(expect.objectContaining({ knowledgeBaseId: 5 }));
    expect(useMoocsQuery).toHaveBeenCalledWith(5);
    expect(useTasksQuery).toHaveBeenCalledWith(5, 1);
    // 资料与成员随预览一并拿到（各一次）
    expect(useKnowledgeBaseDocsQuery).toHaveBeenCalledWith(5);
    expect(useKnowledgeBaseMembersQuery).toHaveBeenCalledTimes(1);
    expect(useKnowledgeBaseMembersQuery.mock.calls[0]?.[0]).toBe(5);
  });
});
