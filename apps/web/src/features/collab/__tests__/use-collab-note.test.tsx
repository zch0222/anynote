import { useCollabNote } from "@/features/collab/use-collab-note";
import {
  COLLAB_INJECT_ORIGIN,
  COLLAB_META_KEY,
  COLLAB_META_ORIGIN,
  readSavedVersion,
} from "@/lib/collab/injection";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const useCollabRoom = vi.hoisted(() => vi.fn());
vi.mock("@/features/collab/use-collab-room", () => ({ useCollabRoom }));

type AwarenessState = Map<number, unknown>;

/** 够用的假房间状态：只实现 hook 真正触碰到的那几个成员。 */
function room(overrides: Partial<Record<string, unknown>> = {}) {
  const doc = new Y.Doc();
  const states: AwarenessState = new Map();
  const provider = {
    synced: true,
    on: vi.fn(),
    off: vi.fn(),
    awareness: {
      getStates: () => states,
      on: vi.fn(),
      off: vi.fn(),
    },
  };
  return {
    doc,
    provider,
    states,
    state: {
      doc,
      provider,
      user: { id: "7", name: "小明", color: "#2563eb" },
      connected: true,
      status: "connected",
      synced: true,
      error: null,
      peers: [],
      reconnect: vi.fn(),
      ...overrides,
    },
  };
}

beforeEach(() => {
  useCollabRoom.mockReset();
});

describe("useCollabNote 连接与房间", () => {
  it("enabled=false 时不连任何房间（开关关闭即回到单人链路）", () => {
    const { state } = room();
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: false, editor: null, markdown: null }),
    );

    expect(useCollabRoom).toHaveBeenCalledWith(null);
    expect(result.current.active).toBe(false);
  });

  it("enabled=true 时连 note:<id> 房间并暴露 doc/provider/user", () => {
    const { state, doc, provider } = room();
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: null }),
    );

    expect(useCollabRoom).toHaveBeenCalledWith("note:42");
    expect(result.current.active).toBe(true);
    expect(result.current.doc).toBe(doc);
    expect(result.current.provider).toBe(provider);
    expect(result.current.connected).toBe(true);
  });

  it("连接错误态反映为 degraded（页面据此回退单人模式）", () => {
    const { state } = room({ status: "error", connected: false });
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: null }),
    );
    expect(result.current.degraded).toBe(true);
    expect(result.current.connected).toBe(false);
  });
});

describe("useCollabNote 共享版本号", () => {
  it("别人写入 meta.savedVersion 后，本地 savedVersion 跟着更新", async () => {
    const { state, doc } = room();
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: null }),
    );

    expect(result.current.savedVersion).toBeNull();
    act(() => doc.getMap(COLLAB_META_KEY).set("savedVersion", "1758297600000"));
    await waitFor(() => expect(result.current.savedVersion).toBe("1758297600000"));
  });

  it("publishSavedVersion 把版本号写进共享 meta", () => {
    const { state, doc } = room();
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: null }),
    );

    act(() => result.current.publishSavedVersion("1758297600000"));
    expect(readSavedVersion(doc)).toBe("1758297600000");
  });

  it("publishSavedVersion 拿到 null 时不写（无版本号可广播）", () => {
    const { state, doc } = room();
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: null }),
    );

    act(() => result.current.publishSavedVersion(null));
    expect(readSavedVersion(doc)).toBeNull();
  });
});

describe("useCollabNote 保存排队过滤（§7.3.1）", () => {
  it("provider 广播的远端更新不触发 onLocalEdit", () => {
    const { state, doc, provider } = room();
    useCollabRoom.mockReturnValue(state);
    const onLocalEdit = vi.fn();
    renderHook(() =>
      useCollabNote({
        noteId: 42,
        enabled: true,
        editor: {} as never,
        markdown: null,
        onLocalEdit,
      }),
    );

    act(() => {
      doc.transact(() => doc.getText("remote").insert(0, "远端"), provider);
    });
    expect(onLocalEdit).not.toHaveBeenCalled();
  });

  it("冷启动注入的 origin 不触发 onLocalEdit（内容本就来自 DB）", () => {
    const { state, doc } = room();
    useCollabRoom.mockReturnValue(state);
    const onLocalEdit = vi.fn();
    renderHook(() =>
      useCollabNote({
        noteId: 42,
        enabled: true,
        editor: {} as never,
        markdown: null,
        onLocalEdit,
      }),
    );

    act(() => {
      doc.transact(() => doc.getText("seed").insert(0, "注入"), COLLAB_INJECT_ORIGIN);
    });
    expect(onLocalEdit).not.toHaveBeenCalled();
  });

  /**
   * 回归：写共享 meta 不是正文编辑。
   *
   * 从前它没有 origin，于是「保存成功 → 写 savedVersion → 又排一次保存」，
   * 每个编辑批次固定多发一次 PATCH。
   */
  it("写共享 meta 不触发 onLocalEdit", () => {
    const { state, doc } = room();
    useCollabRoom.mockReturnValue(state);
    const onLocalEdit = vi.fn();
    const { result } = renderHook(() =>
      useCollabNote({
        noteId: 42,
        enabled: true,
        editor: {} as never,
        markdown: null,
        onLocalEdit,
      }),
    );

    act(() => result.current.publishSavedVersion("1758297600000"));
    expect(readSavedVersion(doc)).toBe("1758297600000");
    expect(onLocalEdit).not.toHaveBeenCalled();

    act(() => {
      doc.transact(() => doc.getMap(COLLAB_META_KEY).set("seeded", true), COLLAB_META_ORIGIN);
    });
    expect(onLocalEdit).not.toHaveBeenCalled();
  });

  it("本地编辑（origin 既不是 provider 也不是协同运行时自己）触发 onLocalEdit", () => {
    const { state, doc } = room();
    useCollabRoom.mockReturnValue(state);
    const onLocalEdit = vi.fn();
    renderHook(() =>
      useCollabNote({
        noteId: 42,
        enabled: true,
        editor: { id: "editor" } as never,
        markdown: null,
        onLocalEdit,
      }),
    );

    act(() => doc.getText("local").insert(0, "本地"));
    // 刻意不带正文参数：那一刻编辑器的 markdown 快照还落后一次击键
    expect(onLocalEdit).toHaveBeenCalledWith();
  });
});

describe("useCollabNote 正文就位与可写判定", () => {
  it("开关关闭时恒可写（单人链路由编辑器自己管）", () => {
    const { state } = room();
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: false, editor: null, markdown: "# 标题" }),
    );
    expect(result.current.contentReady).toBe(true);
    expect(result.current.editable).toBe(true);
  });

  /**
   * 回归：连接建立前不得放开编辑。
   *
   * 那段时间编辑器跑的是单人 `full` 预设，协同绑定到位后整个实例会被重建，
   * 这期间敲下的字会连同旧实例一起被丢掉——实测「屏幕上没了、库里却有」。
   */
  it("协同开启但还没连上时不可写", () => {
    const { state } = room({ doc: null, provider: null, status: "connecting" });
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: "# 标题" }),
    );
    expect(result.current.contentReady).toBe(false);
    expect(result.current.editable).toBe(false);
  });

  /**
   * 回归：这是冷启动缺陷里真正毁数据的一环。
   *
   * 房间还空、正文还没注入时放开编辑，用户会对着空白编辑器打字，
   * 那一拍保存就把库里的正文整段覆盖掉。
   */
  it("连上但房间正文还空时不可写；正文到位后转为可写", async () => {
    const { state, doc } = room();
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: "# 标题" }),
    );

    expect(result.current.editable).toBe(false);

    act(() => {
      doc.getXmlFragment("default").insert(0, [new Y.XmlText("正文")]);
    });
    await waitFor(() => expect(result.current.contentReady).toBe(true));
    expect(result.current.editable).toBe(true);
  });

  it("没有待注入的正文（新笔记）时不等待", () => {
    const { state } = room();
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: null }),
    );
    expect(result.current.editable).toBe(true);
  });

  it("降级后恢复可写（回到单人链路，不能锁着编辑器）", () => {
    const { state } = room({ status: "error", connected: false });
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: "# 标题" }),
    );
    expect(result.current.degraded).toBe(true);
    expect(result.current.contentReady).toBe(false);
    expect(result.current.editable).toBe(true);
  });
});

describe("useCollabNote 暴露房间状态", () => {
  it("回传 peers 与 reconnect", () => {
    const peers = [{ clientId: 7, name: "小明", color: "#2563eb", self: true }];
    const reconnect = vi.fn();
    const { state } = room({ peers, reconnect });
    useCollabRoom.mockReturnValue(state);
    const { result } = renderHook(() =>
      useCollabNote({ noteId: 42, enabled: true, editor: null, markdown: null }),
    );

    expect(result.current.peers).toEqual(peers);
    expect(result.current.reconnect).toBe(reconnect);
  });
});
