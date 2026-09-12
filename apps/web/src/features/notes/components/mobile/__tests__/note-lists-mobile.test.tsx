import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/notes",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/features/notes/use-knowledge-bases", () => ({
  useKnowledgeBasesQuery: vi.fn(),
  useKnowledgeBaseQuery: vi.fn(() => ({ data: { knowledgeBaseName: "我的库" } })),
  useCreateKnowledgeBaseMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock("@/features/notes/use-notes", () => ({ useNotesQuery: vi.fn() }));

import { MobileNoteBases } from "@/features/notes/components/mobile/note-bases-mobile";
import { MobileNoteList } from "@/features/notes/components/mobile/note-list-mobile";
import { useKnowledgeBasesQuery } from "@/features/notes/use-knowledge-bases";
import { useNotesQuery } from "@/features/notes/use-notes";
import { renderWithProviders } from "@/test/render";

const IDLE = { isPending: false, isError: false, isFetching: false };

function mockBases(value: Record<string, unknown>) {
  vi.mocked(useKnowledgeBasesQuery).mockReturnValue(value as never);
}
function mockNotes(value: Record<string, unknown>) {
  vi.mocked(useNotesQuery).mockReturnValue(value as never);
}

describe("MobileNoteBases", () => {
  it("渲染知识库并跳到笔记列表", () => {
    mockBases({ ...IDLE, data: [{ id: 3, knowledgeBaseName: "我的库", detail: "简介" }] });
    renderWithProviders(<MobileNoteBases />);

    expect(screen.getByRole("link", { name: /我的库/ })).toHaveAttribute("href", "/m/notes/3");
    expect(screen.getByText("简介")).toBeInTheDocument();
  });

  it("wikis 复用同一列表，跳只读路由且不给新建入口", () => {
    mockBases({ ...IDLE, data: [{ id: 3, knowledgeBaseName: "我的库" }] });
    renderWithProviders(<MobileNoteBases basePath="/m/wikis" title="知识库" showCreate={false} />);

    expect(screen.getByRole("link", { name: /我的库/ })).toHaveAttribute("href", "/m/wikis/3");
    expect(screen.queryByRole("button", { name: /新建知识库/ })).toBeNull();
    expect(screen.getByRole("heading", { name: "知识库" })).toBeInTheDocument();
  });

  it("空态与错误态分别提示", () => {
    mockBases({ ...IDLE, data: [] });
    const { unmount } = renderWithProviders(<MobileNoteBases />);
    expect(screen.getByText("还没有知识库")).toBeInTheDocument();
    unmount();

    mockBases({ isPending: false, isError: true, error: new Error("网络异常") });
    renderWithProviders(<MobileNoteBases />);
    expect(screen.getByText(/知识库加载失败：网络异常/)).toBeInTheDocument();
  });
});

describe("MobileNoteList", () => {
  it("渲染笔记并跳到编辑器，带新建入口", () => {
    mockNotes({
      ...IDLE,
      data: { rows: [{ id: 7, title: "会议纪要", updateTime: "2026-09-11T08:00:00" }], pages: 1 },
    });
    renderWithProviders(<MobileNoteList baseId={3} />);

    expect(screen.getByRole("link", { name: /会议纪要/ })).toHaveAttribute("href", "/m/notes/3/7");
    expect(screen.getByTestId("mobile-note-create")).toHaveAttribute(
      "href",
      "/m/notes/new?baseId=3",
    );
  });

  it("wikis 模式跳只读路由且没有新建入口", () => {
    mockNotes({ ...IDLE, data: { rows: [{ id: 7, title: "会议纪要" }], pages: 1 } });
    renderWithProviders(<MobileNoteList baseId={3} basePath="/m/wikis" showCreate={false} />);

    expect(screen.getByRole("link", { name: /会议纪要/ })).toHaveAttribute("href", "/m/wikis/3/7");
    expect(screen.queryByTestId("mobile-note-create")).toBeNull();
  });

  it("只有一页时不渲染翻页控件", () => {
    mockNotes({ ...IDLE, data: { rows: [{ id: 7, title: "笔记" }], pages: 1 } });
    renderWithProviders(<MobileNoteList baseId={3} />);
    expect(screen.queryByTestId("mobile-note-pager")).toBeNull();
  });

  it("多页时可以翻到下一页，首页禁用上一页", () => {
    mockNotes({ ...IDLE, data: { rows: [{ id: 7, title: "笔记" }], pages: 3 } });
    renderWithProviders(<MobileNoteList baseId={3} />);

    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    fireEvent.click(screen.getByTestId("mobile-note-next"));
    // 换页后 useNotesQuery 会带新的 page 再取一次
    expect(vi.mocked(useNotesQuery).mock.lastCall?.[0]).toMatchObject({
      knowledgeBaseId: 3,
      page: 2,
    });
  });

  it("空态文案区分可写与只读", () => {
    mockNotes({ ...IDLE, data: { rows: [], pages: 1 } });
    const { unmount } = renderWithProviders(<MobileNoteList baseId={3} />);
    expect(screen.getByText("新建一篇，开始记录。")).toBeInTheDocument();
    unmount();

    mockNotes({ ...IDLE, data: { rows: [], pages: 1 } });
    renderWithProviders(<MobileNoteList baseId={3} basePath="/m/wikis" showCreate={false} />);
    expect(screen.getByText("等有人往这个库里写点什么再来看看。")).toBeInTheDocument();
  });

  it("加载失败展示错误", () => {
    mockNotes({ isPending: false, isError: true, isFetching: false, error: new Error("超时") });
    renderWithProviders(<MobileNoteList baseId={3} />);
    expect(screen.getByText(/笔记加载失败：超时/)).toBeInTheDocument();
  });
});
