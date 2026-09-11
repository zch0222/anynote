import { CollabDocLibrary } from "@/features/collab/components/doc-library";
import type { CollabIndexState } from "@/features/collab/use-collab-index";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useCollabIndex = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock("@/features/collab/use-collab-index", () => ({ useCollabIndex }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() }, Toaster: () => null }));

function state(overrides: Partial<CollabIndexState> = {}): CollabIndexState {
  return {
    doc: null,
    provider: null,
    user: { id: "7", name: "小明", color: "#2563eb" },
    status: "connected",
    error: null,
    peers: [],
    docs: [],
    createDoc: vi.fn(),
    renameDoc: vi.fn(),
    touchDoc: vi.fn(),
    removeDoc: vi.fn(),
    ...overrides,
  };
}

const sampleDoc = {
  id: "abcdefgh",
  title: "设计稿评审",
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  createdBy: "小红",
};

beforeEach(() => {
  useCollabIndex.mockReset();
  push.mockReset();
});

describe("CollabDocLibrary", () => {
  it("连接失败时显示原因，而不是空列表", () => {
    useCollabIndex.mockReturnValue(state({ status: "error", error: new Error("协同服务未启动") }));
    render(<CollabDocLibrary />);

    expect(screen.getByText(/协同服务未启动/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("连接失败");
  });

  it("连接中时禁用新建按钮（此时写入会丢）", () => {
    useCollabIndex.mockReturnValue(state({ status: "connecting" }));
    render(<CollabDocLibrary />);

    expect(screen.getByRole("button", { name: /新建文档/ })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("连接中");
  });

  it("已连接但没有文档时给出空态引导", () => {
    useCollabIndex.mockReturnValue(state());
    render(<CollabDocLibrary />);

    expect(screen.getByText("还没有协同文档")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /新建文档/ })).toBeEnabled();
  });

  it("渲染文档卡片，标题链到对应协同房间", () => {
    useCollabIndex.mockReturnValue(state({ docs: [sampleDoc] }));
    render(<CollabDocLibrary />);

    expect(screen.getByRole("link", { name: "设计稿评审" })).toHaveAttribute(
      "href",
      "/docs/abcdefgh",
    );
    expect(screen.getByText("由 小红 创建")).toBeInTheDocument();
  });

  it("新建成功后跳到新文档", async () => {
    const createDoc = vi.fn().mockReturnValue({ ...sampleDoc, id: "newdoc01", title: "季度规划" });
    useCollabIndex.mockReturnValue(state({ createDoc }));
    render(<CollabDocLibrary />);

    fireEvent.click(screen.getByRole("button", { name: /新建文档/ }));
    fireEvent.change(await screen.findByLabelText("标题"), { target: { value: "季度规划" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(createDoc).toHaveBeenCalledWith("季度规划"));
    expect(push).toHaveBeenCalledWith("/docs/newdoc01");
  });

  it("标题为空时不提交，交由校验提示", async () => {
    const createDoc = vi.fn();
    useCollabIndex.mockReturnValue(state({ createDoc }));
    render(<CollabDocLibrary />);

    fireEvent.click(screen.getByRole("button", { name: /新建文档/ }));
    fireEvent.click(await screen.findByRole("button", { name: "创建" }));

    expect(await screen.findByText("请输入文档标题")).toBeInTheDocument();
    expect(createDoc).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("删除按钮把文档从索引里移除", async () => {
    const removeDoc = vi.fn().mockReturnValue(true);
    useCollabIndex.mockReturnValue(state({ docs: [sampleDoc], removeDoc }));
    render(<CollabDocLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "删除 设计稿评审" }));

    expect(removeDoc).toHaveBeenCalledWith("abcdefgh");
  });

  it("展示在线成员，自己标注为「你」", () => {
    useCollabIndex.mockReturnValue(
      state({
        peers: [
          { clientId: 1, name: "小明", color: "#2563eb", self: true },
          { clientId: 2, name: "小红", color: "#16a34a", self: false },
        ],
      }),
    );
    render(<CollabDocLibrary />);

    expect(screen.getByText("小明（你）")).toBeInTheDocument();
    expect(screen.getByText("小红")).toBeInTheDocument();
  });
});
