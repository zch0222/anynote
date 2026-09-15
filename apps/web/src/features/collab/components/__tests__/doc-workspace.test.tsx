import { CollabDocWorkspace, readDocPresence } from "@/features/collab/components/doc-workspace";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const room = vi.hoisted(() => ({
  doc: {},
  provider: {},
  user: { name: "小明", color: "#2563eb" },
  status: "connected" as string,
  error: null as Error | null,
  peers: [] as Array<{ name: string; color: string }>,
  reconnect: vi.fn(),
}));
/** 记录 `useCollabRoom` 收到了什么房间名——`null` 表示"不连"。 */
const useCollabRoomMock = vi.hoisted(() => vi.fn((_room: string | null) => room));
vi.mock("@/features/collab/use-collab-room", () => ({ useCollabRoom: useCollabRoomMock }));

const index = vi.hoisted(() => ({
  docs: [] as Array<{ id: string; title: string }>,
  status: "connected" as string,
  synced: true,
  error: null as Error | null,
  peers: [],
  createDoc: vi.fn(),
  renameDoc: vi.fn(),
  touchDoc: vi.fn(),
  removeDoc: vi.fn(),
  reconnect: vi.fn(),
}));
vi.mock("@/features/collab/use-collab-index", () => ({ useCollabIndex: () => index }));

vi.mock("@/components/editor/TiptapEditor", () => ({
  TiptapEditor: ({ preset, toolbar }: { preset: string; toolbar?: string }) => (
    <div data-testid="editor" data-preset={preset} data-toolbar={toolbar} />
  ),
}));

const copyText = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
  Toaster: () => null,
}));

const DOC_ID = "abcdefgh";

beforeEach(() => {
  useCollabRoomMock.mockClear();
  room.status = "connected";
  room.error = null;
  room.reconnect = vi.fn();
  index.status = "connected";
  index.synced = true;
  index.docs = [{ id: DOC_ID, title: "周会纪要" }];
  copyText.mockReset().mockResolvedValue(undefined);
  toastSuccess.mockReset();
  toastError.mockReset();
  vi.stubGlobal("navigator", { clipboard: { writeText: copyText } });
  // jsdom 的 location.href 默认是 http://localhost/，给一个能看出来的地址
  window.history.replaceState({}, "", `/docs/${DOC_ID}`);
});

describe("readDocPresence", () => {
  /**
   * 判据是 synced 而不是 status：WebSocket 握手成功时本地 Y.Doc 还是空的，
   * 用 status 会让每一篇正常文档闪一下「已移除」。
   */
  it("索引还没同步完成时不做判断（避免把还没读到的文档误判成已移除）", () => {
    expect(readDocPresence(false, [], DOC_ID)).toBe("unknown");
  });

  it("索引已同步且有该 id 时是正常文档", () => {
    expect(readDocPresence(true, [{ id: DOC_ID }], DOC_ID)).toBe("present");
  });

  it("索引已同步但没有该 id 时判定为已移除", () => {
    expect(readDocPresence(true, [{ id: "other-doc" }], DOC_ID)).toBe("removed");
    expect(readDocPresence(true, [], DOC_ID)).toBe("removed");
  });
});

describe("CollabDocWorkspace", () => {
  it("已连接时渲染协同编辑器，不显示断线条", () => {
    render(<CollabDocWorkspace docId={DOC_ID} />);

    expect(screen.getByTestId("editor")).toHaveAttribute("data-preset", "collaborative");
    expect(screen.queryByText("连接已断开，恢复后会自动同步你的改动")).not.toBeInTheDocument();
  });

  it("复制链接写入当前地址并提示", async () => {
    render(<CollabDocWorkspace docId={DOC_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));

    await waitFor(() => expect(copyText).toHaveBeenCalledTimes(1));
    expect(copyText.mock.calls[0]?.[0]).toContain(`/docs/${DOC_ID}`);
    expect(toastSuccess).toHaveBeenCalledWith("链接已复制，发给同伴即可一起编辑");
  });

  it("剪贴板不可用时如实提示，不假装成功", async () => {
    copyText.mockRejectedValue(new Error("NotAllowedError"));
    render(<CollabDocWorkspace docId={DOC_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "复制链接" }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("断线时正文上方出现提示条，正文继续可编辑", () => {
    room.status = "connecting";
    render(<CollabDocWorkspace docId={DOC_ID} />);

    expect(screen.getByText("连接已断开，恢复后会自动同步你的改动")).toBeInTheDocument();
    // 断线不该把编辑器收走：Y.Doc 在本地保留改动，恢复后自动同步
    expect(screen.getByTestId("editor")).toBeInTheDocument();
  });

  it("提示条上的「重新连接」调用 hook 的 reconnect", () => {
    room.status = "connecting";
    render(<CollabDocWorkspace docId={DOC_ID} />);

    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    expect(room.reconnect).toHaveBeenCalledTimes(1);
  });

  it("索引已连接且没有该 id 时显示移除态，不再打开空房间", () => {
    index.docs = [];
    render(<CollabDocWorkspace docId={DOC_ID} />);

    expect(screen.getByText("这篇文档已从文档库移除")).toBeInTheDocument();
    expect(screen.getByText("可能被其他成员移除了。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "回到文档库" })).toHaveAttribute("href", "/docs");
    // 关键：不能退化成"当成新文档打开一个空房间"
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();
    // 而且是真的没连：传 null 让 useCollabRoom 走"暂不连接"分支
    expect(useCollabRoomMock).toHaveBeenLastCalledWith(null);
  });

  it("文档还在时正常连它自己的房间", () => {
    render(<CollabDocWorkspace docId={DOC_ID} />);
    expect(useCollabRoomMock).toHaveBeenLastCalledWith(`doc:${DOC_ID}`);
  });

  it("索引未连接时不显示移除态（此时列表天然为空）", () => {
    index.docs = [];
    index.status = "connecting";
    index.synced = false;
    render(<CollabDocWorkspace docId={DOC_ID} />);

    expect(screen.queryByText("这篇文档已从文档库移除")).not.toBeInTheDocument();
    // 未同步时也不能因此不连正文房间——那会把正常文档挡在门外
    expect(useCollabRoomMock).toHaveBeenLastCalledWith(`doc:${DOC_ID}`);
  });

  /** 已连接但还没收到索引快照：这是每一篇正常文档打开时都会经过的一帧。 */
  it("WebSocket 已连接但索引快照未到时，不显示移除态", () => {
    index.docs = [];
    index.status = "connected";
    index.synced = false;
    render(<CollabDocWorkspace docId={DOC_ID} />);

    expect(screen.queryByText("这篇文档已从文档库移除")).not.toBeInTheDocument();
  });

  it("协同连接失败时给出用户语言的原因与重试", () => {
    room.status = "error";
    room.error = new Error("ECONNREFUSED");
    render(<CollabDocWorkspace docId={DOC_ID} />);

    // 旧文案会原样透出 ECONNREFUSED 与「请确认 collab 服务已启动」
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("协同服务暂时连不上，稍后重试。");
    expect(alert).not.toHaveTextContent("ECONNREFUSED");
    expect(screen.queryByTestId("editor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新连接" }));
    expect(room.reconnect).toHaveBeenCalledTimes(1);
  });

  it("标题从协同索引灌入，失焦时写回", () => {
    render(<CollabDocWorkspace docId={DOC_ID} />);

    const input = screen.getByLabelText("文档标题");
    expect(input).toHaveValue("周会纪要");

    fireEvent.change(input, { target: { value: "周会纪要（终版）" } });
    fireEvent.blur(input);
    expect(index.renameDoc).toHaveBeenCalledWith(DOC_ID, "周会纪要（终版）");
  });
});
