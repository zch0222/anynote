import { renderWithProviders } from "@/test/render";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useKnowledgeBaseQuery = vi.fn();
vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBaseQuery: (...args: unknown[]) => useKnowledgeBaseQuery(...args),
}));

const useMoocQuery = vi.fn();
const useMoocItemsQuery = vi.fn();
const useMoocItemQuery = vi.fn();
const useObjectUrlQuery = vi.fn();
const fetchMoocItems = vi.fn();
vi.mock("../../use-moocs", () => ({
  useMoocQuery: (...args: unknown[]) => useMoocQuery(...args),
  useMoocItemsQuery: (...args: unknown[]) => useMoocItemsQuery(...args),
  useMoocItemQuery: (...args: unknown[]) => useMoocItemQuery(...args),
  useObjectUrlQuery: (...args: unknown[]) => useObjectUrlQuery(...args),
  // 目录惰性遍历用它按需取子条目（走 queryClient.fetchQuery）
  fetchMoocItems: (...args: unknown[]) => fetchMoocItems(...args),
}));

// DPlayer 在 jsdom 里没有意义，视频位只需要一个可断言的占位
vi.mock("../video-player", () => ({
  VideoPlayer: ({ url }: { url: string }) => <div data-testid="video-player">{url}</div>,
}));

vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ value }: { value: string }) => <div data-testid="readonly-editor">{value}</div>,
}));

import { MoocDetailPage } from "../mooc-detail";

const IDLE = { isPending: false, isError: false, isFetching: false };

/**
 * 目录：
 *   1 第 1 章（章节）
 *   ├─ 11 视频 A
 *   └─ 12 文档 B
 *   2 第 2 章（章节）
 *   ├─ 21 视频 C
 *   └─ 22 视频 D
 */
const TOP_ITEMS = [
  { id: 1, title: "第 1 章", moocItemType: 0 },
  { id: 2, title: "第 2 章", moocItemType: 0 },
];

const CHILDREN: Record<number, Array<Record<string, unknown>>> = {
  1: [
    { id: 11, title: "视频 A", moocItemType: 1, parentId: 1, objectName: "a.mp4" },
    { id: 12, title: "文档 B", moocItemType: 2, parentId: 1 },
  ],
  2: [
    { id: 21, title: "视频 C", moocItemType: 1, parentId: 2, objectName: "c.mp4" },
    { id: 22, title: "视频 D", moocItemType: 1, parentId: 2, objectName: "d.mp4" },
  ],
};

function mockItems() {
  useMoocItemsQuery.mockImplementation(
    (_moocId: number, parentId: number) =>
      ({ ...IDLE, data: parentId === 0 ? TOP_ITEMS : (CHILDREN[parentId] ?? []) }) as never,
  );
}

/** 目录惰性遍历走的是 `fetchMoocItems`（组件用 queryClient.fetchQuery 包了一层）。 */
function mockCatalog(top: Array<Record<string, unknown>>, children: typeof CHILDREN) {
  fetchMoocItems.mockImplementation((_moocId: number, parentId: number) =>
    Promise.resolve((parentId === 0 ? top : (children[parentId] ?? [])) as never),
  );
}

/** 全部条目按 id 索引：条目详情接口返回的 title / type 与列表是同一份数据。 */
const ALL_ITEMS: Record<number, Record<string, unknown>> = Object.fromEntries(
  [...TOP_ITEMS, ...Object.values(CHILDREN).flat()].map((item) => [item.id as number, item]),
);

function mockItemDetail() {
  useMoocItemQuery.mockImplementation(
    (_moocId: number, itemId: number) =>
      ({
        ...IDLE,
        data: {
          moocItemText: null,
          ...(ALL_ITEMS[itemId] ?? { id: itemId, moocItemType: 1, objectName: "x.mp4" }),
        },
      }) as never,
  );
}

beforeEach(() => {
  useKnowledgeBaseQuery.mockReset();
  useMoocQuery.mockReset();
  useMoocItemsQuery.mockReset();
  useMoocItemQuery.mockReset();
  useObjectUrlQuery.mockReset();

  useKnowledgeBaseQuery.mockReturnValue({ ...IDLE, data: { id: 5, permissions: 2 } });
  useMoocQuery.mockReturnValue({ ...IDLE, data: { id: 8, title: "数据结构", knowledgeBaseId: 5 } });
  useObjectUrlQuery.mockReturnValue({ ...IDLE, data: { url: "https://oss/x.mp4" } });
  mockItems();
  mockCatalog(TOP_ITEMS, CHILDREN);
  mockItemDetail();
});

describe("MoocDetailPage 目录选中（D-06 缺陷修复）", () => {
  /**
   * 缺陷复现：`:142` 把父章节的 `onSelect` 原样传给 `ChapterChildren`，
   * 子条目点击后执行的是"选中父章节 + 收起父章节"——视频根本打不开。
   *
   * 这条用例在修复前必然是红的：右侧仍然是父章节、章节还被收起来了。
   */
  it("展开章节后点子条目：右侧打开子条目，父章节保持展开", async () => {
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    // 自动选中第一个视频后，左侧目录（aside）里第 1 章是展开的
    const catalog = screen.getByTestId("mooc-detail").querySelector("aside") as HTMLElement;
    const child = await within(catalog).findByText("文档 B");

    fireEvent.click(child);

    // 右侧面板的标题变成子条目（不再还是父章节）
    await waitFor(() => expect(screen.getByTestId("mooc-item-panel")).toHaveTextContent("文档 B"));
    // 父章节没有被收起：两个子条目仍然可见
    expect(within(catalog).getByText("视频 A")).toBeInTheDocument();
    expect(within(catalog).getByRole("button", { name: "收起章节" })).toBeInTheDocument();
  });

  it("点子条目后不会把父章节标成选中", async () => {
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    const catalog = screen.getByTestId("mooc-detail").querySelector("aside") as HTMLElement;
    fireEvent.click(await within(catalog).findByText("文档 B"));

    await waitFor(() =>
      expect(within(catalog).getByText("文档 B").closest("button")?.className).toContain(
        "bg-accent-soft",
      ),
    );
    // 父章节那一行不该带上选中底色
    expect(screen.getByTestId("mooc-item-1").className).not.toContain("bg-accent-soft");
  });

  it("默认选中目录里的第一个视频（进入页面就能看）", async () => {
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    // 第一个视频在第一章下，需要按需取子条目
    await waitFor(() => expect(screen.getByTestId("mooc-item-panel")).toHaveTextContent("视频 A"));
  });

  it("顶层直接是视频时也默认选中", async () => {
    const top = [{ id: 31, title: "独立视频", moocItemType: 1, objectName: "s.mp4" }];
    useMoocItemsQuery.mockImplementation(
      (_moocId: number, parentId: number) =>
        ({ ...IDLE, data: parentId === 0 ? top : [] }) as never,
    );
    mockCatalog(top, {});
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    await waitFor(() =>
      expect(screen.getByTestId("mooc-item-panel")).toHaveTextContent("独立视频"),
    );
  });
});

describe("MoocDetailPage 页头（D-06）", () => {
  it("「‹ 慕课」回到本库的慕课 Tab，并显示课程名", async () => {
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    expect(await screen.findByRole("heading", { name: "数据结构" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /慕课/ })).toHaveAttribute("href", "/notes/5/mooc");
  });

  it("标题下一行说明条目在哪个章节里", async () => {
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    await waitFor(() => expect(screen.getByTestId("mooc-item-panel")).toBeInTheDocument());
    expect(screen.getByTestId("mooc-item-panel")).toHaveTextContent("视频 · 在「第 1 章」中");
  });
});

describe("MoocDetailPage 下一节（D-06）", () => {
  it("按目录顺序取下一个条目，跨章节也能接上", async () => {
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    // 默认是第 1 章的视频 A → 下一节应是同章的文档 B
    fireEvent.click(await screen.findByRole("button", { name: "下一节" }));
    await waitFor(() => expect(screen.getByTestId("mooc-item-panel")).toHaveTextContent("文档 B"));

    // 再下一节跨到第 2 章的视频 C
    fireEvent.click(screen.getByRole("button", { name: "下一节" }));
    await waitFor(() => expect(screen.getByTestId("mooc-item-panel")).toHaveTextContent("视频 C"));
  });

  it("最后一节隐藏「下一节」", async () => {
    const top = [
      { id: 41, title: "唯一章节", moocItemType: 0 },
      { id: 42, title: "唯一视频", moocItemType: 1, objectName: "only.mp4" },
    ];
    useMoocItemsQuery.mockImplementation(
      (_moocId: number, parentId: number) =>
        ({ ...IDLE, data: parentId === 0 ? top : [] }) as never,
    );
    mockCatalog(top, {});
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    // 默认选中目录里第一个可播放条目（只有"唯一视频"），它已经是最后一节
    await waitFor(() =>
      expect(screen.getByTestId("mooc-item-panel")).toHaveTextContent("唯一视频"),
    );
    expect(screen.queryByRole("button", { name: "下一节" })).toBeNull();
  });
});

describe("MoocDetailPage 视频地址失败（D-06）", () => {
  it("显示失败文案并提供「重新获取」", async () => {
    const refetch = vi.fn();
    useObjectUrlQuery.mockReturnValue({
      isPending: false,
      isError: true,
      isFetching: false,
      refetch,
      data: undefined,
    });
    renderWithProviders(<MoocDetailPage baseId={5} moocId={8} />);

    expect(await screen.findByText("视频地址获取失败，请稍后重试。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新获取" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
