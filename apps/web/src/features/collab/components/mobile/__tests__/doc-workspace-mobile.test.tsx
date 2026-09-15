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
  // useCollabRoom 的真实签名里有它（错误态与断线提示条的出路）
  reconnect: vi.fn(),
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
  TiptapEditor: ({
    toolbar,
    preset,
    disabledCommands,
  }: {
    toolbar?: string;
    preset: string;
    disabledCommands?: readonly string[];
  }) => (
    <div
      data-testid="editor"
      data-toolbar={toolbar}
      data-preset={preset}
      data-disabled-commands={disabledCommands?.join(",")}
    />
  ),
}));

import { MobileDocWorkspace } from "@/features/collab/components/mobile/doc-workspace-mobile";
import { renderWithProviders } from "@/test/render";

describe("MobileDocWorkspace", () => {
  it("用协同预设 + 移动端工具条", () => {
    room.status = "connected";
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    const editor = screen.getByTestId("editor");
    expect(editor).toHaveAttribute("data-preset", "collaborative");
    expect(editor).toHaveAttribute("data-toolbar", "mobile");
  });

  it("标题从协同索引灌入，失焦时写回", () => {
    room.status = "connected";
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    const input = screen.getByLabelText("文档标题");
    expect(input).toHaveValue("周会纪要");

    fireEvent.change(input, { target: { value: "周会纪要（终版）" } });
    fireEvent.blur(input);
    expect(index.renameDoc).toHaveBeenCalledWith("doc-1", "周会纪要（终版）");
  });

  it("标题没变时不写回，避免无意义的索引广播", () => {
    room.status = "connected";
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);
    index.renameDoc.mockClear();

    fireEvent.blur(screen.getByLabelText("文档标题"));
    expect(index.renameDoc).not.toHaveBeenCalled();
  });

  it("在线成员与连接状态收进顶栏", () => {
    room.status = "connected";
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);
    expect(screen.getByTitle("小红")).toBeInTheDocument();
  });

  it("协同连接失败时给 QueryError 与重试，不渲染编辑器", () => {
    room.status = "error";
    room.error = new Error("ECONNREFUSED");
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    // 技术原文不外泄（toUserMessage 的兜底），但必须有重试出路
    expect(screen.getByRole("alert")).toHaveTextContent("协同服务加载失败");
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(screen.queryByTestId("editor")).toBeNull();
  });

  it("错误态的「重试」调 reconnect，而不是重挂组件", () => {
    room.status = "error";
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(room.reconnect).toHaveBeenCalledTimes(1);
    room.status = "connected";
    room.error = null;
  });

  it("工具条的图片按钮置灰（协同文档不支持图片）", () => {
    room.status = "connected";
    room.error = null;
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);
    expect(screen.getByTestId("editor")).toHaveAttribute("data-disabled-commands", "image");
  });

  it("首次进入（还没连上过）不显示断线提示条", () => {
    room.status = "connecting";
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    // connecting 在首屏是"正在连"，那句提示的语义是"刚刚掉的线"
    expect(document.querySelector('[data-slot="connection-banner"]')).toBeNull();
    room.status = "connected";
  });

  it("连上过之后掉线，标题下出现提示条与「重新连接」", () => {
    room.status = "connected";
    const { rerender } = renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    room.status = "connecting";
    rerender(<MobileDocWorkspace docId="doc-1" />);

    const banner = document.querySelector('[data-slot="connection-banner"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain("连接已断开，恢复后会自动同步你的改动");
    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    expect(room.reconnect).toHaveBeenCalled();
    room.status = "connected";
  });

  it("索引已同步但没有这条文档时显示「文档已移除」", () => {
    room.status = "connected";
    index.docs = [{ id: "doc-other", title: "别的文档", createdBy: "小明", updatedAt: 1 }];
    renderWithProviders(<MobileDocWorkspace docId="doc-1" />);

    expect(screen.getByText("找不到这个文档")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到文档库" })).toHaveAttribute("href", "/m/docs");
    index.docs = [{ id: "doc-1", title: "周会纪要", createdBy: "小明", updatedAt: 1 }];
  });
});
