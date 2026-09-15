import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/dashboard",
}));

vi.mock("@/features/auth/use-me", () => ({ useMe: vi.fn() }));
vi.mock("@/features/notes/use-knowledge-bases", () => ({ useKnowledgeBasesQuery: vi.fn() }));
vi.mock("@/features/notes/use-notes", () => ({ useNotesQuery: vi.fn() }));
vi.mock("@/features/tasks/use-tasks", () => ({ useTasksQuery: vi.fn() }));

import { useMe } from "@/features/auth/use-me";
import { MobileDashboard } from "@/features/dashboard/components/mobile-dashboard";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { useTasksQuery } from "@/features/tasks/use-tasks";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false };

function setup(options: {
  bases?: Record<string, unknown>;
  notes?: Record<string, unknown>;
  tasks?: Record<string, unknown>;
  me?: Record<string, unknown>;
}) {
  vi.mocked(useMe).mockReturnValue((options.me ?? { data: { nickname: "小明" } }) as never);
  vi.mocked(useKnowledgeBasesQuery).mockReturnValue(
    (options.bases ?? { ...IDLE, data: [{ id: 3, knowledgeBaseName: "我的库" }] }) as never,
  );
  vi.mocked(useNotesQuery).mockReturnValue(
    (options.notes ?? { ...IDLE, data: { rows: [] } }) as never,
  );
  vi.mocked(useTasksQuery).mockReturnValue(
    (options.tasks ?? { ...IDLE, data: { rows: [] } }) as never,
  );
}

describe("MobileDashboard", () => {
  it("问候语用昵称，拿不到时回退", () => {
    setup({});
    renderWithProviders(<MobileDashboard />);
    expect(screen.getByText("你好，小明")).toBeInTheDocument();
  });

  it("没有昵称时退到用户名，都没有时用兜底称呼", () => {
    setup({ me: { data: { username: "tester" } } });
    const { unmount } = renderWithProviders(<MobileDashboard />);
    expect(screen.getByText("你好，tester")).toBeInTheDocument();
    unmount();

    setup({ me: { data: undefined } });
    renderWithProviders(<MobileDashboard />);
    expect(screen.getByText("你好，朋友")).toBeInTheDocument();
  });

  it("四个快捷入口都指向移动端路由", () => {
    setup({});
    renderWithProviders(<MobileDashboard />);
    const quick = screen.getByRole("navigation", { name: "快捷操作" });
    expect(within(quick).getByRole("link", { name: "新建笔记" })).toHaveAttribute(
      "href",
      "/m/notes/new",
    );
    expect(within(quick).getByRole("link", { name: "搜索" })).toHaveAttribute("href", "/m/search");
    expect(within(quick).getAllByRole("link")).toHaveLength(4);
  });

  it("最近笔记按首个知识库渲染，标题写明是哪个库", () => {
    setup({
      notes: {
        ...IDLE,
        data: {
          rows: [
            { id: 7, title: "会议纪要", updateTime: "2026-09-11T08:00:00" },
            { id: 8, title: null, updateTime: null },
          ],
        },
      },
    });
    renderWithProviders(<MobileDashboard />);

    expect(screen.getByText("「我的库」最近笔记")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /会议纪要/ })).toHaveAttribute("href", "/m/notes/3/7");
    expect(screen.getByRole("link", { name: /未命名笔记/ })).toBeInTheDocument();
  });

  it("待办只列 0 与 3 的前三条（1 与 2 都不列）", () => {
    setup({
      tasks: {
        ...IDLE,
        data: {
          rows: [
            { id: 1, taskName: "任务一", submissionStatus: 0 },
            { id: 2, taskName: "已交", submissionStatus: 1 },
            { id: 3, taskName: "管理员自己", submissionStatus: 2 },
            { id: 4, taskName: "已退回的", submissionStatus: 3 },
            { id: 5, taskName: "任务五", submissionStatus: 0 },
            { id: 6, taskName: "任务六", submissionStatus: 0 },
          ],
        },
      },
    });
    renderWithProviders(<MobileDashboard />);

    const list = screen.getByTestId("dashboard-tasks");
    // 0/0/3 三条（第 4 条 0 被条数上限截掉）
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).queryByText("已交")).toBeNull();
    // §1.4 第 2 条：2 是「无需提交」（管理员自己），不是待办
    expect(within(list).queryByText("管理员自己")).toBeNull();
    // 已退回也算待办，状态文案照实显示
    expect(within(list).getByText("已退回")).toBeInTheDocument();
  });

  it("任务行可点，去当前库的任务 Tab", () => {
    setup({
      tasks: {
        ...IDLE,
        data: { rows: [{ id: 1, taskName: "任务一", submissionStatus: 0 }] },
      },
    });
    renderWithProviders(<MobileDashboard />);

    expect(screen.getByTestId("dashboard-task-1")).toHaveAttribute("href", "/m/notes/3/tasks");
  });

  it("「待办 · 全部」指向当前库的任务 Tab，不是跨库的 /m/tasks", () => {
    setup({});
    renderWithProviders(<MobileDashboard />);

    // 三个分组各有一个「全部」，取「待办」那一节里的
    const pending = screen.getByText("待办").closest("section") as HTMLElement;
    expect(within(pending).getByRole("link", { name: /全部/ })).toHaveAttribute(
      "href",
      "/m/notes/3/tasks",
    );
  });

  it("没有知识库时给创建引导，而不是空白或报错", () => {
    setup({ bases: { ...IDLE, data: [] } });
    renderWithProviders(<MobileDashboard />);

    expect(screen.getByText("还没有知识库")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "去创建" })).toHaveAttribute("href", "/m/notes");
    expect(screen.getByText("任务挂在知识库下，先创建一个知识库。")).toBeInTheDocument();
  });

  it("知识库加载失败时展示错误而不是空态", () => {
    setup({ bases: { isPending: false, isError: true, error: new Error("网络异常") } });
    renderWithProviders(<MobileDashboard />);
    expect(screen.getByText("加载失败：网络异常")).toBeInTheDocument();
  });

  it("加载中渲染骨架", () => {
    setup({ bases: { isPending: true, isError: false, data: undefined } });
    const { container } = renderWithProviders(<MobileDashboard />);
    // 骨架改用共享预设：普通 Skeleton 是 aria-hidden 的，靠 aria-busy 的容器定位
    expect(container.querySelector('[data-slot="skeleton-list"]')).toBeTruthy();
  });

  it("知识库卡片最多四个，指向各自的笔记列表", () => {
    setup({
      bases: {
        ...IDLE,
        data: [1, 2, 3, 4, 5].map((id) => ({ id, knowledgeBaseName: `库${id}` })),
      },
    });
    renderWithProviders(<MobileDashboard />);

    expect(screen.getByRole("link", { name: "库1" })).toHaveAttribute("href", "/m/notes/1");
    expect(screen.queryByRole("link", { name: "库5" })).toBeNull();
  });
});
