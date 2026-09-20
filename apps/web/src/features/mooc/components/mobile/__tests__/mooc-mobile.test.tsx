import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/notes/3/mooc",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(),
  useKnowledgeBaseQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: { id: 3, knowledgeBaseName: "我的库", type: 0 },
  })),
}));
const catalogState = vi.hoisted(() => ({
  top: [] as Array<Record<string, unknown>>,
  children: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/features/mooc/use-moocs", () => ({
  useMoocsQuery: vi.fn(),
  useMoocQuery: vi.fn(() => ({
    isPending: false,
    isError: false,
    data: { id: 9, title: "数据结构" },
  })),
  useMoocItemsQuery: vi.fn(),
  useMoocItemQuery: vi.fn(() => ({ isPending: false, data: undefined })),
  useObjectUrlQuery: vi.fn(() => ({ isPending: false, isError: false, data: undefined })),
  /*
   * 目录惰性遍历（`lib/catalog.ts`）经 `queryClient.fetchQuery` 调它取每一级，
   * 所以这里必须按 parentId 返回真实数据——只 mock `useMoocItemsQuery` 的话
   * 「下一节」与「默认选中第一个」都拿不到目录。
   */
  fetchMoocItems: vi.fn(async (_moocId: number, parentId: number) =>
    parentId === 0 ? catalogState.top : catalogState.children,
  ),
}));
// DPlayer 只在真实浏览器里有意义，这里只关心版式
vi.mock("@/features/mooc/components/video-player", () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value }: { value: string }) => <div data-testid="readonly-editor">{value}</div>,
}));

import { MobileMoocDetail } from "@/features/mooc/components/mobile/mooc-detail-mobile";
import { MobileMoocList } from "@/features/mooc/components/mobile/mooc-list-mobile";
import { useMoocItemsQuery, useMoocsQuery } from "@/features/mooc/use-moocs";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false, isFetching: false };

describe("MobileMoocList", () => {
  it("渲染课程行并跳到本库的课程详情（不再有跨库选择器）", () => {
    vi.mocked(useMoocsQuery).mockReturnValue({
      ...IDLE,
      data: {
        rows: [
          {
            id: 9,
            title: "数据结构",
            moocDescription: "入门课",
            updateTime: "2026-09-11T08:00:00",
          },
        ],
        total: 1,
      },
    } as never);

    renderWithProviders(<MobileMoocList baseId={3} />);

    expect(screen.getByTestId("mobile-mooc-9")).toHaveAttribute("href", "/m/notes/3/mooc/9");
    expect(screen.getByText("入门课")).toBeInTheDocument();
    // 图例 10：更新于 {相对时间}
    expect(screen.getByText(/更新于/)).toBeInTheDocument();
    // 跨库选择器已删掉：页面里不该再有「选择知识库」的按钮
    expect(screen.queryByRole("button", { name: /选择知识库/ })).toBeNull();
  });

  it("无简介的课程保留占位行「还没有填写简介」（V09：省略整行会让行高随数据跳）", () => {
    vi.mocked(useMoocsQuery).mockReturnValue({
      ...IDLE,
      data: {
        rows: [{ id: 9, title: "数据结构", moocDescription: "   ", updateTime: null }],
        total: 1,
      },
    } as never);

    renderWithProviders(<MobileMoocList baseId={3} />);

    expect(screen.getByText("还没有填写简介")).toBeInTheDocument();
  });

  it("带上知识库内的公共头部，当前 Tab 是「慕课」", () => {
    vi.mocked(useMoocsQuery).mockReturnValue({ ...IDLE, data: { rows: [], total: 0 } } as never);
    renderWithProviders(<MobileMoocList baseId={3} />);

    expect(screen.getByTestId("mobile-base-header")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-base-tab-mooc")).toHaveAttribute("aria-current", "page");
  });

  it("空态是「课程在桌面版创建。」且不给按钮", () => {
    vi.mocked(useMoocsQuery).mockReturnValue({ ...IDLE, data: { rows: [], total: 0 } } as never);
    renderWithProviders(<MobileMoocList baseId={3} />);

    expect(screen.getByText("这个知识库还没有课程")).toBeInTheDocument();
    expect(screen.getByText("课程在桌面版创建。")).toBeInTheDocument();
    // 空态里不该有任何按钮 / 链接（库头 Tab 与顶栏返回键不算，它们是外框）
    const empty = document.querySelector('[data-slot="empty-state"]') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(within(empty).queryByRole("button")).toBeNull();
    expect(within(empty).queryByRole("link")).toBeNull();
  });
});

describe("MobileMoocDetail", () => {
  function mockItems(rows: Array<Record<string, unknown>>) {
    catalogState.top = rows;
    catalogState.children = [{ id: 99, title: "子条目", moocItemType: 1 }];
    vi.mocked(useMoocItemsQuery).mockImplementation(
      (_moocId: number, parentId: number) =>
        ({
          ...IDLE,
          data: parentId === 0 ? rows : catalogState.children,
        }) as never,
    );
  }

  it("顶栏固定显示课程名，不再随所选条目变", () => {
    mockItems([{ id: 2, title: "第一节", moocItemType: 1 }]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);

    expect(screen.getByRole("heading", { name: "数据结构" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mooc-item-2"));
    // 选中后顶栏仍是课程名（旧实现会变成「第一节」）
    expect(screen.getByRole("heading", { name: "数据结构" })).toBeInTheDocument();
  });

  it("进页面自动选中目录里的第一个视频（同 D-06 的规则）", async () => {
    mockItems([
      { id: 1, title: "第一章", moocItemType: 0 },
      { id: 2, title: "第一节", moocItemType: 1, objectName: "a.mp4" },
    ]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);

    // 自动选中并切到内容页：不必先展开章节再点一次
    expect(await screen.findByTestId("mooc-item-panel")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "内容" })).toHaveAttribute("aria-checked", "true");
  });

  it("只有章节、没有视频/文档时停在目录页", () => {
    mockItems([{ id: 1, title: "第一章", moocItemType: 0 }]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);

    expect(screen.getByRole("radio", { name: "目录" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("mooc-item-1")).toBeInTheDocument();
  });

  it("点视频条目自动切到内容页并渲染播放器", () => {
    mockItems([{ id: 2, title: "第一节", moocItemType: 1, objectName: "a.mp4" }]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);

    fireEvent.click(screen.getByTestId("mooc-item-2"));
    expect(screen.getByRole("radio", { name: "内容" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("mooc-item-panel")).toBeInTheDocument();
  });

  it("点章节只展开子条目，不切走内容页", () => {
    mockItems([{ id: 1, title: "第一章", moocItemType: 0 }]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);

    fireEvent.click(screen.getByTestId("mooc-item-1"));
    expect(screen.getByRole("radio", { name: "目录" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("mooc-item-99")).toBeInTheDocument();
  });

  it("点子条目打开内容并自动切页（§1.4 的子条目缺陷）", () => {
    mockItems([{ id: 1, title: "第一章", moocItemType: 0 }]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);

    fireEvent.click(screen.getByTestId("mooc-item-1"));
    fireEvent.click(screen.getByTestId("mooc-item-99"));

    // 切到内容页（切页后目录不再渲染，所以这里的断言只看内容区）
    expect(screen.getByRole("radio", { name: "内容" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("mooc-item-panel")).toBeInTheDocument();
    // 所在章节指向父章节，说明子条目选择逻辑走的是"打开内容"而不是"收起父章节"
    expect(screen.getByTestId("mooc-item-breadcrumb")).toHaveTextContent("视频 · 第一章");

    // 切回目录：父章节仍处于展开态（旧实现会因为它被当成"选中项"而收起）
    fireEvent.click(screen.getByRole("radio", { name: "目录" }));
    expect(screen.getByTestId("mooc-item-1")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("mooc-item-99")).toBeInTheDocument();
  });

  it("内容区显示所在章节，并给出「下一节」", async () => {
    mockItems([
      { id: 1, title: "第一章", moocItemType: 0 },
      { id: 2, title: "第二节", moocItemType: 1 },
    ]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);

    fireEvent.click(screen.getByTestId("mooc-item-1"));
    fireEvent.click(screen.getByTestId("mooc-item-99"));

    expect(screen.getByTestId("mooc-item-breadcrumb")).toHaveTextContent("视频 · 第一章");
    // 「下一节」按目录顺序异步算出（要走 lib/catalog 的遍历）
    expect(await screen.findByTestId("mooc-next-item")).toHaveTextContent("第二节");
  });

  it("最后一节隐藏「下一节」", async () => {
    mockItems([{ id: 2, title: "唯一一节", moocItemType: 1 }]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);

    // 进入页面会自动选中第一个（也是唯一一个）视频
    expect(await screen.findByTestId("mooc-item-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("mooc-next-item")).toBeNull();
    // 「重新获取」始终在
    expect(screen.getByTestId("mooc-refresh-url")).toBeInTheDocument();
  });

  it("空课程给出提示", () => {
    mockItems([]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);
    expect(screen.getByText("这门课还没有章节内容")).toBeInTheDocument();
  });

  it("返回兜底指向本库的慕课 Tab", () => {
    mockItems([]);
    renderWithProviders(<MobileMoocDetail baseId={3} moocId={9} />);
    expect(screen.getByTestId("mobile-back")).toBeInTheDocument();
  });
});
