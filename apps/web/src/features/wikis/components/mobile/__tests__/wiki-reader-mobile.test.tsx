import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/wikis/3/7",
}));

vi.mock("@/features/notes/use-note", () => ({ useNoteQuery: vi.fn() }));
vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ preset, value }: { preset: string; value: string }) => (
    <div data-testid="editor" data-preset={preset}>
      {value}
    </div>
  ),
}));

import { useNoteQuery } from "@/features/notes/use-note";
import { MobileWikiReader } from "@/features/wikis/components/mobile/wiki-reader-mobile";
import { renderWithProviders } from "@/test/render";

describe("MobileWikiReader", () => {
  it("用只读预设渲染正文，标题进顶栏", () => {
    vi.mocked(useNoteQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: { title: "领域模型", content: "# 正文" },
    } as never);

    renderWithProviders(<MobileWikiReader baseId={3} noteId={7} />);

    expect(screen.getByRole("heading", { name: "领域模型" })).toBeInTheDocument();
    expect(screen.getByTestId("editor")).toHaveAttribute("data-preset", "readonly");
    expect(screen.getByTestId("editor")).toHaveTextContent("# 正文");
  });

  it("给出去编辑器的入口（阅读页本身不可写）", () => {
    vi.mocked(useNoteQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: { title: "领域模型", content: "" },
    } as never);

    renderWithProviders(<MobileWikiReader baseId={3} noteId={7} />);
    expect(screen.getByTestId("wiki-edit-link")).toHaveAttribute("href", "/m/notes/3/7");
  });

  it("返回键回到该知识库的列表而不是笔记 tab 根", () => {
    vi.mocked(useNoteQuery).mockReturnValue({
      isPending: false,
      isError: false,
      data: { title: "x", content: "" },
    } as never);

    renderWithProviders(<MobileWikiReader baseId={3} noteId={7} />);
    expect(screen.getByTestId("mobile-back")).toBeInTheDocument();
  });

  it("加载失败展示错误而不是空白正文", () => {
    vi.mocked(useNoteQuery).mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error("没有权限"),
    } as never);

    renderWithProviders(<MobileWikiReader baseId={3} noteId={7} />);
    expect(screen.getByText(/笔记加载失败：没有权限/)).toBeInTheDocument();
    expect(screen.queryByTestId("editor")).toBeNull();
  });
});
