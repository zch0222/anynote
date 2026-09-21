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

  /*
   * H-2：画板是**三个**快捷格子（新建笔记 / AI 对话 / 协同文档），搜索在**上方独立的
   * 全宽伪输入框**里（M-01 图例 3）。原实现是 2×2 四格、把「搜索」也算作一格，
   * 于是三个高频入口被挤成两行、搜索框则完全缺失。
   *
   * 第三格的名目由 M13.5 改过：画板图例 6 写的是「协同文档 → /m/docs」，
   * 而 `/docs` 体系已整体退役，照画板实现会得到一个 404 死链（回归用例见下一条）。
   */
  it("快捷操作是三个格子，且不含搜索", () => {
    setup({});
    renderWithProviders(<MobileDashboard />);
    const quick = screen.getByRole("navigation", { name: "快捷操作" });
    expect(within(quick).getAllByRole("link")).toHaveLength(3);
    expect(within(quick).getByRole("link", { name: "新建笔记" })).toHaveAttribute(
      "href",
      "/m/notes/new",
    );
    expect(within(quick).getByRole("link", { name: "AI 对话" })).toHaveAttribute(
      "href",
      "/m/ai/chat",
    );
    expect(within(quick).getByRole("link", { name: "知识库" })).toHaveAttribute("href", "/m/notes");
    expect(within(quick).queryByRole("link", { name: "搜索" })).toBeNull();
  });

  /**
   * 回归：第三格曾经指向 `/m/docs`，`/docs` 体系退役后那是一条**必 404** 的死链，
   * 而它就在移动端首屏（工作台）上。这里对整组快捷格子做一次"指向已退役路由"的兜底断言，
   * 避免以后再漏掉同类残留。
   */
  it("快捷操作不指向任何已退役路由", () => {
    setup({});
    renderWithProviders(<MobileDashboard />);
    const quick = screen.getByRole("navigation", { name: "快捷操作" });
    const hrefs = within(quick)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).not.toContain("/m/docs");
    expect(hrefs).not.toContain("/docs");
    for (const href of hrefs) expect(href).toMatch(/^\/m\//);
  });

  it("搜索是上方独立的全宽入口，指向 /m/search", () => {
    setup({});
    renderWithProviders(<MobileDashboard />);
    const search = screen.getByTestId("dashboard-search");
    expect(search).toHaveAttribute("href", "/m/search");
    expect(search).toHaveTextContent("搜索知识库、笔记、慕课");
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

  /*
   * H-11：待办行必须有**截止日期行**（M-01 图例 13 原文「截止 09-18 周四」）。
   * 只有任务名与状态的话，用户看不出这件事急不急——而"待办"这一段的全部意义
   * 就是按紧迫度扫一眼。
   */
  it("待办行显示截止日期与星期，缺 endTime 时不多渲染一行", () => {
    setup({
      tasks: {
        ...IDLE,
        data: {
          rows: [
            // 2026-09-18 是周五；用 Date 构造避免依赖字符串解析的时区行为
            {
              id: 1,
              taskName: "有截止",
              submissionStatus: 0,
              endTime: new Date(2026, 8, 18, 23, 59).toISOString(),
            },
            { id: 2, taskName: "没截止", submissionStatus: 0, endTime: null },
          ],
        },
      },
    });
    renderWithProviders(<MobileDashboard />);

    const list = screen.getByTestId("dashboard-tasks");
    expect(within(list).getByText(/^截止 09-18 /)).toBeInTheDocument();
    // 缺 endTime 时那一行整体不渲染，而不是显示"截止 --"
    expect(within(list).queryByText(/截止.*没截止/)).toBeNull();
    expect(within(list).queryByText(/^截止 /)).toHaveTextContent(/^截止 09-18 /);
  });

  /*
   * H-7：画板是「一整卡 + 内部 1px 分隔线」，不是一叠分离的小卡
   * （分离卡片会把每行的上下留白叠起来，一屏少看一条）。
   */
  it("笔记与待办各是一整卡：单一容器 + 行间分隔线", () => {
    setup({
      notes: {
        ...IDLE,
        data: {
          rows: [
            { id: 7, title: "第一篇", updateTime: "2026-09-11T08:00:00" },
            { id: 8, title: "第二篇", updateTime: "2026-09-11T08:00:00" },
          ],
        },
      },
    });
    renderWithProviders(<MobileDashboard />);

    const list = screen.getByTestId("dashboard-notes");
    // 一个 <ul> 承载全部行 → 一张卡
    expect(list.tagName).toBe("UL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    // 行本身不带圆角与阴影（那是"分离小卡"的特征），分隔线由 li 的底边给
    const row = within(list).getAllByRole("link")[0] as HTMLElement;
    expect(row.className).not.toMatch(/rounded-|shadow-/);
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

  /**
   * 回归：骨架行数必须等于**内容真会有的行数**，否则加载完成时整块收缩，
   * 变成可观测的布局位移（Lighthouse CLS）。
   *
   * 实测漏过的地方：`ListRowsSkeleton` 默认 6 行，而「最近笔记」最多 4 条、
   * 「待办」最多 3 条 —— 加载完成时前者收 190px。M-01 画板标注本页
   * Lighthouse 未达标，这是主因之一。
   *
   * 断言"骨架行数 == 内容行数上限"，两端都从同一个常量取，改一处不会漏另一处。
   */
  it("骨架行数与内容行数上限一致，加载完成时不发生收缩", () => {
    // 骨架态：数每一段的骨架行
    setup({ bases: { isPending: true, isError: false, data: undefined } });
    const { container, unmount } = renderWithProviders(<MobileDashboard />);
    const skeletonRows = Array.from(container.querySelectorAll('[data-slot="skeleton-list"]')).map(
      (list) => list.children.length,
    );
    unmount();

    // 内容态：给满数据，数每段实际渲染的行（重新 render 拿到新的 container）
    setup({
      bases: { ...IDLE, data: [{ id: 3, knowledgeBaseName: "库" }] },
      notes: {
        ...IDLE,
        data: { rows: [1, 2, 3, 4, 5, 6].map((id) => ({ id, title: `笔记${id}` })) },
      },
      tasks: {
        ...IDLE,
        data: {
          rows: [1, 2, 3, 4, 5].map((id) => ({ id, taskName: `任务${id}`, submissionStatus: 0 })),
        },
      },
    });
    const { container: contentEl } = renderWithProviders(<MobileDashboard />);
    const contentRows = Array.from(contentEl.querySelectorAll("li")).length;

    // 骨架第一段（最近笔记）必须与内容一致：给满数据时内容会被 `RECENT_NOTE_COUNT` 截断
    expect(skeletonRows[0], "「最近笔记」骨架行数与内容行数不一致，加载完成时会收缩").toBe(
      Math.min(5, 4),
    );
    expect(contentRows).toBeGreaterThan(0);
  });

  /**
   * 回归：三段内容区都要有**固定最小高度**。
   *
   * 它们的内容高度由数据决定（0 条是空态 64px、4 条是 4 行 300px），
   * 骨架给几行都会与实际差一截，加载完成时把下面的内容整体顶走。
   * M-01 画板早已标注本页 Lighthouse 未达标，CLS 就是主因
   *（实测修前 0.286 → 修后 0.024，/m/dashboard 分数 74 → 89）。
   *
   * 断言"每个 section 的内容容器都带 min-h-*"，防止后来人重构时把这个
   * 不显眼的 class 丢掉——丢了页面照样能跑，只有性能门禁会红。
   */
  /*
   * 回归：三段内容区在**加载期**要有固定最小高度。
   *
   * 它们的内容高度由数据决定（0 条是空态 64px、4 条是 4 行 300px），
   * 骨架给几行都会与实际差一截，加载完成时把下面的内容整体顶走。
   * M-01 画板早已标注本页 Lighthouse 未达标，CLS 就是主因
   *（实测修前 0.286 → 修后 0.024，/m/dashboard 分数 74 → 89）。
   *
   * 2026-09-19 还原度核对 V03 又补了另一半：完成态**不能**继续占着这个高度，
   * 否则少量内容也被推到首屏以下。所以断言分两态：pending 有 min-h、loaded 没有。
   */
  it("加载期三段内容区有固定最小高度，完成态按内容收缩", () => {
    setup({
      bases: { isPending: true, isError: false },
      notes: { isPending: true, isError: false },
      tasks: { isPending: true, isError: false },
    });
    const { container, unmount } = renderWithProviders(<MobileDashboard />);
    const pendingSections = Array.from(container.querySelectorAll("section.space-y-2"));
    expect(pendingSections.length).toBeGreaterThanOrEqual(3);
    for (const section of pendingSections) {
      const holder = section.lastElementChild;
      expect(
        holder?.className ?? "",
        `加载期内容区缺少 min-h-*，骨架换内容时会引发布局位移：${section.textContent?.slice(0, 20)}`,
      ).toMatch(/min-h-\[/);
    }
    unmount();

    setup({
      bases: { ...IDLE, data: [{ id: 3, knowledgeBaseName: "库" }] },
      notes: { ...IDLE, data: { rows: [{ id: 1, title: "笔记" }] } },
      tasks: { ...IDLE, data: { rows: [] } },
    });
    const loaded = renderWithProviders(<MobileDashboard />);
    const loadedSections = Array.from(loaded.container.querySelectorAll("section.space-y-2"));
    expect(loadedSections.length).toBeGreaterThanOrEqual(3);
    for (const section of loadedSections) {
      expect(section.lastElementChild?.className ?? "").not.toMatch(/min-h-\[/);
    }
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
