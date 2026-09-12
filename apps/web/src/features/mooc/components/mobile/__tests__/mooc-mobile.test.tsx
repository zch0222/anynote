import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/mooc",
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({ useKnowledgeBasesQuery: vi.fn() }));
vi.mock("@/features/mooc/use-moocs", () => ({
  useMoocsQuery: vi.fn(),
  useMoocItemsQuery: vi.fn(),
  useMoocItemQuery: vi.fn(() => ({ isPending: false, data: undefined })),
  useObjectUrlQuery: vi.fn(() => ({ isPending: false, isError: false, data: undefined })),
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
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false };

describe("MobileMoocList", () => {
  it("渲染课程卡片并跳到移动端详情", () => {
    vi.mocked(useKnowledgeBasesQuery).mockReturnValue({
      ...IDLE,
      data: [{ id: 3, knowledgeBaseName: "库" }],
    } as never);
    vi.mocked(useMoocsQuery).mockReturnValue({
      ...IDLE,
      data: { rows: [{ id: 9, title: "数据结构", moocDescription: "入门课" }] },
    } as never);

    renderWithProviders(<MobileMoocList />);

    expect(screen.getByTestId("mooc-card-9")).toHaveAttribute("href", "/m/mooc/9");
    expect(screen.getByText("入门课")).toBeInTheDocument();
  });

  it("没有知识库时提示先建库", () => {
    vi.mocked(useKnowledgeBasesQuery).mockReturnValue({ ...IDLE, data: [] } as never);
    vi.mocked(useMoocsQuery).mockReturnValue({ ...IDLE, data: { rows: [] } } as never);

    renderWithProviders(<MobileMoocList />);
    expect(screen.getByText("还没有可用的知识库")).toBeInTheDocument();
  });
});

describe("MobileMoocDetail", () => {
  function mockItems(rows: Array<Record<string, unknown>>) {
    vi.mocked(useMoocItemsQuery).mockImplementation(
      (_moocId: number, parentId: number) =>
        ({
          ...IDLE,
          data: parentId === 0 ? rows : [{ id: 99, title: "子条目", moocItemType: 1 }],
        }) as never,
    );
  }

  it("默认停在目录页，没选条目时内容页给提示", () => {
    mockItems([{ id: 1, title: "第一章", moocItemType: 0 }]);
    renderWithProviders(<MobileMoocDetail moocId={9} />);

    expect(screen.getByRole("tab", { name: "目录" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("mooc-item-1")).toBeInTheDocument();
  });

  it("点视频条目自动切到内容页并渲染播放器", () => {
    mockItems([{ id: 2, title: "第一节", moocItemType: 1, objectName: "a.mp4" }]);
    renderWithProviders(<MobileMoocDetail moocId={9} />);

    fireEvent.click(screen.getByTestId("mooc-item-2"));
    expect(screen.getByRole("tab", { name: "内容" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("mooc-item-panel")).toBeInTheDocument();
  });

  it("点章节只展开子条目，不切走标签页", () => {
    mockItems([{ id: 1, title: "第一章", moocItemType: 0 }]);
    renderWithProviders(<MobileMoocDetail moocId={9} />);

    fireEvent.click(screen.getByTestId("mooc-item-1"));
    expect(screen.getByRole("tab", { name: "目录" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("mooc-item-99")).toBeInTheDocument();
  });

  it("空课程给出提示", () => {
    mockItems([]);
    vi.mocked(useMoocItemsQuery).mockReturnValue({ ...IDLE, data: [] } as never);
    renderWithProviders(<MobileMoocDetail moocId={9} />);
    expect(screen.getByText("这门课还没有章节内容")).toBeInTheDocument();
  });
});
