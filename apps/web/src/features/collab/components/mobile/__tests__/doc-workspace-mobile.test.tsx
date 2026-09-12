import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/m/docs/doc-1",
}));

const room = vi.hoisted(() => ({
  status: "connected" as string,
  error: null as Error | null,
  peers: [{ name: "小红", color: "#f00" }],
  doc: {},
  provider: {},
  user: { name: "小明", color: "#0f0" },
}));
vi.mock("@/features/collab/use-collab-room", () => ({ useCollabRoom: () => room }));

const index = vi.hoisted(() => ({
  docs: [{ id: "doc-1", title: "周会纪要", createdBy: "小明", updatedAt: 1 }],
  status: "connected",
  error: null,
  createDoc: vi.fn(),
  renameDoc: vi.fn(),
  touchDoc: vi.fn(),
  removeDoc: vi.fn(),
  peers: [],
}));
vi.mock("@/features/collab/use-collab-index", () => ({ useCollabIndex: () => index }));

vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ toolbar, preset }: { toolbar?: string; preset: string }) => (
    <div data-testid="editor" data-toolbar={toolbar} data-preset={preset} />
  ),
}));

import { MobileDocWorkspace } from "@/features/collab/components/mobile/doc-workspace-mobile";
import { renderWithProviders } from "@/test/render";

describe("MobileDocWorkspace", () => {
  it("用协同预设 + 移动端工具条", () => {
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    const editor = screen.getByTestId("editor");
    expect(editor).toHaveAttribute("data-preset", "collaborative");
    expect(editor).toHaveAttribute("data-toolbar", "mobile");
  });

  it("标题从协同索引灌入，失焦时写回", () => {
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    const input = screen.getByLabelText("文档标题");
    expect(input).toHaveValue("周会纪要");

    fireEvent.change(input, { target: { value: "周会纪要（终版）" } });
    fireEvent.blur(input);
    expect(index.renameDoc).toHaveBeenCalledWith("doc-1", "周会纪要（终版）");
  });

  it("标题没变时不写回，避免无意义的索引广播", () => {
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);
    index.renameDoc.mockClear();

    fireEvent.blur(screen.getByLabelText("文档标题"));
    expect(index.renameDoc).not.toHaveBeenCalled();
  });

  it("在线成员与连接状态收进顶栏", () => {
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);
    expect(screen.getByTitle("小红")).toBeInTheDocument();
  });

  it("协同连接失败时给排查提示，不渲染编辑器", () => {
    room.status = "error";
    room.error = new Error("ECONNREFUSED");
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    expect(screen.getByText(/协同服务连接失败：ECONNREFUSED/)).toBeInTheDocument();
    expect(screen.queryByTestId("editor")).toBeNull();
    room.status = "connected";
    room.error = null;
  });
});
