import { CollabDocLibrary, formatDocTime } from "@/features/collab/components/doc-library";
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
    synced: true,
    error: null,
    peers: [],
    docs: [],
    createDoc: vi.fn(),
    renameDoc: vi.fn(),
    touchDoc: vi.fn(),
    removeDoc: vi.fn(),
    reconnect: vi.fn(),
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
  it("页面标题与侧栏入口同名", () => {
    useCollabIndex.mockReturnValue(state());
    render(<CollabDocLibrary />);

    expect(screen.getByRole("heading", { name: "协同文档", level: 1 })).toBeInTheDocument();
  });

  it("连接失败时给出用户语言的原因与「重新连接」，不点名 collab 服务", () => {
    const reconnect = vi.fn();
    useCollabIndex.mockReturnValue(
      state({ status: "error", error: new Error("collab 未启动"), reconnect }),
    );
    render(<CollabDocLibrary />);

    // 旧文案「请确认 collab 服务已启动」是写给开发者的，不能出现在用户界面
    expect(screen.queryByText(/collab/)).not.toBeInTheDocument();
    expect(screen.getByText("协同服务暂时连不上，已写下的内容不会丢失。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("连接中时禁用新建按钮（此时写入会丢）", () => {
    useCollabIndex.mockReturnValue(state({ status: "connecting" }));
    render(<CollabDocLibrary />);

    expect(screen.getByRole("button", { name: /新建文档/ })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("连接中");
  });

  /** 握手成功但索引快照未到：`docs` 还是空的，此时不能报空态。 */
  it("已连接但索引尚未同步时不显示空态（否则每篇文档都还在也会闪一下）", () => {
    useCollabIndex.mockReturnValue(state({ synced: false }));
    render(<CollabDocLibrary />);

    expect(screen.queryByText("还没有协同文档")).not.toBeInTheDocument();
  });

  it("已连接但没有文档时给出空态引导，且空态本身能新建", () => {
    useCollabIndex.mockReturnValue(state());
    render(<CollabDocLibrary />);

    expect(screen.getByText("还没有协同文档")).toBeInTheDocument();
    // D-10 图例 18：空态里的「新建文档」与页头那颗走同一个对话框
    const buttons = screen.getAllByRole("button", { name: /新建文档/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1] as HTMLElement);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("卡片标题链到对应协同房间", () => {
    useCollabIndex.mockReturnValue(state({ docs: [sampleDoc] }));
    render(<CollabDocLibrary />);

    expect(screen.getByRole("link", { name: "设计稿评审" })).toHaveAttribute(
      "href",
      "/docs/abcdefgh",
    );
    expect(screen.getByText("由 小红 创建")).toBeInTheDocument();
  });

  it("更新时间用相对时间，不再铺全量时间戳", () => {
    const updatedAt = Date.now() - 2 * 60 * 60 * 1_000;
    useCollabIndex.mockReturnValue(state({ docs: [{ ...sampleDoc, updatedAt }] }));
    render(<CollabDocLibrary />);

    expect(screen.getByText("2 小时前更新")).toBeInTheDocument();
    // 旧实现是 toLocaleString 全量时间，如「2026/9/14 12:00:00」
    expect(screen.queryByText(/\d{4}\/\d{1,2}\/\d{1,2}/)).not.toBeInTheDocument();
  });

  it("新建成功后跳到新文档，且页脚有「取消」", async () => {
    const createDoc = vi.fn().mockReturnValue({ ...sampleDoc, id: "newdoc01", title: "季度规划" });
    useCollabIndex.mockReturnValue(state({ createDoc }));
    render(<CollabDocLibrary />);

    fireEvent.click(screen.getAllByRole("button", { name: /新建文档/ })[0] as HTMLElement);
    expect(await screen.findByRole("button", { name: "取消" })).toBeInTheDocument();

    fireEvent.change(await screen.findByLabelText("标题"), { target: { value: "季度规划" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await waitFor(() => expect(createDoc).toHaveBeenCalledWith("季度规划"));
    expect(push).toHaveBeenCalledWith("/docs/newdoc01");
  });

  it("标题为空时不提交，交由校验提示", async () => {
    const createDoc = vi.fn();
    useCollabIndex.mockReturnValue(state({ createDoc }));
    render(<CollabDocLibrary />);

    fireEvent.click(screen.getAllByRole("button", { name: /新建文档/ })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "创建" }));

    expect(await screen.findByText("请输入文档标题")).toBeInTheDocument();
    expect(createDoc).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("删除必须先确认：点垃圾桶只开确认框，不删", async () => {
    const removeDoc = vi.fn().mockReturnValue(true);
    useCollabIndex.mockReturnValue(state({ docs: [sampleDoc], removeDoc }));
    render(<CollabDocLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "删除 设计稿评审" }));

    // 索引是所有端共享的，误删会让所有人的列表都少一条
    expect(removeDoc).not.toHaveBeenCalled();
    expect(await screen.findByText("从文档库移除？")).toBeInTheDocument();
  });

  it("确认后才真的移除", async () => {
    const removeDoc = vi.fn().mockReturnValue(true);
    useCollabIndex.mockReturnValue(state({ docs: [sampleDoc], removeDoc }));
    render(<CollabDocLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "删除 设计稿评审" }));
    fireEvent.click(await screen.findByRole("button", { name: "移除" }));

    expect(removeDoc).toHaveBeenCalledWith("abcdefgh");
  });

  it("确认框里点「取消」不删除，且不残留待删状态", async () => {
    const removeDoc = vi.fn().mockReturnValue(true);
    useCollabIndex.mockReturnValue(state({ docs: [sampleDoc], removeDoc }));
    render(<CollabDocLibrary />);

    fireEvent.click(screen.getByRole("button", { name: "删除 设计稿评审" }));
    fireEvent.click(await screen.findByRole("button", { name: "取消" }));

    expect(removeDoc).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText("从文档库移除？")).not.toBeInTheDocument());
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

describe("formatDocTime", () => {
  it("把索引里的毫秒时间戳转成相对时间", () => {
    const now = Date.now();
    expect(formatDocTime(now - 30_000)).toBe("刚刚");
    expect(formatDocTime(now - 3 * 24 * 60 * 60 * 1_000)).toBe("3 天前");
  });
});
