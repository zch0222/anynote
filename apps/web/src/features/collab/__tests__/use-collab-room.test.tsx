import { useCollabRoom } from "@/features/collab/use-collab-room";
import type { CollabSession } from "@/lib/collab/session";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const openCollabRoom = vi.hoisted(() => vi.fn());
vi.mock("@/lib/collab/session", () => ({ openCollabRoom }));

type Listener = (payload: never) => void;

/** 够用的假会话：只实现 hook 真正触碰到的那几个成员。 */
function createSession(options: { connected?: boolean; synced?: boolean } = {}) {
  const listeners = new Map<string, Listener[]>();
  const awarenessListeners: Listener[] = [];
  const states = new Map<number, unknown>();
  const doc = new Y.Doc();

  const session = {
    doc,
    user: { id: "7", name: "小明", color: "#2563eb" },
    destroy: vi.fn(),
    provider: {
      wsconnected: options.connected ?? false,
      synced: options.synced ?? false,
      disconnect: vi.fn(),
      connect: vi.fn(),
      awareness: {
        getStates: () => states,
        on: (_event: string, listener: Listener) => awarenessListeners.push(listener),
      },
      on: (event: string, listener: Listener) => {
        listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      },
    },
  } as unknown as CollabSession;

  return {
    session,
    states,
    doc,
    emit(event: string, payload: unknown) {
      for (const listener of listeners.get(event) ?? []) listener(payload as never);
    },
    emitAwareness() {
      for (const listener of awarenessListeners) listener(undefined as never);
    },
  };
}

beforeEach(() => {
  openCollabRoom.mockReset();
});

describe("useCollabRoom", () => {
  it("room 为 null 时不连接", async () => {
    const { result } = renderHook(() => useCollabRoom(null));
    expect(openCollabRoom).not.toHaveBeenCalled();
    expect(result.current.status).toBe("disconnected");
    expect(result.current.doc).toBeNull();
  });

  it("连接成功后暴露 doc / provider / user", async () => {
    const fake = createSession({ connected: true });
    openCollabRoom.mockResolvedValue(fake.session);

    const { result } = renderHook(() => useCollabRoom("index"));

    await waitFor(() => expect(result.current.status).toBe("connected"));
    expect(openCollabRoom).toHaveBeenCalledWith(
      "index",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.doc).toBe(fake.doc);
    expect(result.current.user?.name).toBe("小明");
  });

  it("跟随 provider 的 status 事件在连接中/已连接之间切换", async () => {
    const fake = createSession();
    openCollabRoom.mockResolvedValue(fake.session);
    const { result } = renderHook(() => useCollabRoom("index"));

    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.status).toBe("connecting");

    act(() => fake.emit("status", { status: "connected" }));
    expect(result.current.status).toBe("connected");

    act(() => fake.emit("connection-close", null));
    expect(result.current.status).toBe("connecting");
  });

  it("换令牌失败时进入 error 状态并带出原因", async () => {
    openCollabRoom.mockRejectedValue(new Error("登录状态已过期"));
    const { result } = renderHook(() => useCollabRoom("index"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toBe("登录状态已过期");
    expect(result.current.doc).toBeNull();
  });

  it("awareness 变化时刷新成员列表，自己排最前", async () => {
    const fake = createSession({ connected: true });
    openCollabRoom.mockResolvedValue(fake.session);
    const { result } = renderHook(() => useCollabRoom("index"));
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => {
      fake.states.set(999, { user: { name: "小红", color: "#16a34a" } });
      fake.states.set(fake.doc.clientID, { user: { name: "小明", color: "#2563eb" } });
      fake.emitAwareness();
    });

    expect(result.current.peers.map((peer) => peer.name)).toEqual(["小明", "小红"]);
    expect(result.current.peers[0]?.self).toBe(true);
    expect(result.current.peers[1]?.self).toBe(false);
  });

  it("没有 user 字段的 awareness 条目被忽略（别人还没写入身份）", async () => {
    const fake = createSession({ connected: true });
    openCollabRoom.mockResolvedValue(fake.session);
    const { result } = renderHook(() => useCollabRoom("index"));
    await waitFor(() => expect(result.current.status).toBe("connected"));

    act(() => {
      fake.states.set(1, {});
      fake.emitAwareness();
    });

    expect(result.current.peers).toEqual([]);
  });

  it("卸载时销毁会话，不留悬空连接", async () => {
    const fake = createSession({ connected: true });
    openCollabRoom.mockResolvedValue(fake.session);
    const { result, unmount } = renderHook(() => useCollabRoom("index"));
    await waitFor(() => expect(result.current.status).toBe("connected"));

    unmount();

    expect(fake.session.destroy).toHaveBeenCalledTimes(1);
  });

  it("会话还在建立中就卸载，建好后立刻销毁（竞态兜底）", async () => {
    const fake = createSession();
    let resolveOpen: ((session: CollabSession) => void) | undefined;
    openCollabRoom.mockReturnValue(
      new Promise<CollabSession>((resolve) => {
        resolveOpen = resolve;
      }),
    );

    const { unmount } = renderHook(() => useCollabRoom("index"));
    unmount();
    await act(async () => {
      resolveOpen?.(fake.session);
    });

    expect(fake.session.destroy).toHaveBeenCalledTimes(1);
  });

  it("换房间会先拆旧会话再建新的", async () => {
    const first = createSession({ connected: true });
    const second = createSession({ connected: true });
    openCollabRoom.mockResolvedValueOnce(first.session).mockResolvedValueOnce(second.session);

    const { result, rerender } = renderHook(({ room }) => useCollabRoom(room), {
      initialProps: { room: "index" },
    });
    await waitFor(() => expect(result.current.doc).toBe(first.doc));

    rerender({ room: "doc:abcdefgh" });

    await waitFor(() => expect(result.current.doc).toBe(second.doc));
    expect(first.session.destroy).toHaveBeenCalledTimes(1);
  });

  describe("synced（D-11 的「文档已移除」判定要用）", () => {
    it("建立会话时 provider 已完成同步就直接为真", async () => {
      const fake = createSession({ connected: true, synced: true });
      openCollabRoom.mockResolvedValue(fake.session);
      const { result } = renderHook(() => useCollabRoom("index"));

      await waitFor(() => expect(result.current.synced).toBe(true));
    });

    it("只握手成功、还没收到快照时为假（否则会把正常文档读成已移除）", async () => {
      const fake = createSession({ connected: true });
      openCollabRoom.mockResolvedValue(fake.session);
      const { result } = renderHook(() => useCollabRoom("index"));

      await waitFor(() => expect(result.current.status).toBe("connected"));
      expect(result.current.synced).toBe(false);
    });

    it("跟随 provider 的 sync 事件翻转", async () => {
      const fake = createSession({ connected: true });
      openCollabRoom.mockResolvedValue(fake.session);
      const { result } = renderHook(() => useCollabRoom("index"));
      await waitFor(() => expect(result.current.status).toBe("connected"));

      act(() => fake.emit("sync", true));
      expect(result.current.synced).toBe(true);

      // 断线时 y-websocket 会把它置回 false，重连后我们仍能知道索引是否又完整了
      act(() => fake.emit("sync", false));
      expect(result.current.synced).toBe(false);
    });

    it("换房间时退回未同步，不沿用上一间的 synced", async () => {
      const first = createSession({ connected: true, synced: true });
      const second = createSession({ connected: true });
      openCollabRoom.mockResolvedValueOnce(first.session).mockResolvedValueOnce(second.session);

      const { result, rerender } = renderHook(({ room }) => useCollabRoom(room), {
        initialProps: { room: "index" },
      });
      await waitFor(() => expect(result.current.synced).toBe(true));

      rerender({ room: "doc:abcdefgh" });

      await waitFor(() => expect(result.current.doc).toBe(second.doc));
      expect(result.current.synced).toBe(false);
    });
  });

  describe("reconnect（D-10 图例 16 · D-11 图例 12）", () => {
    it("先 disconnect 再 connect，同一个 provider，不重建会话", async () => {
      const fake = createSession({ connected: true });
      openCollabRoom.mockResolvedValue(fake.session);
      const { result } = renderHook(() => useCollabRoom("index"));
      await waitFor(() => expect(result.current.status).toBe("connected"));

      const provider = fake.session.provider as unknown as {
        disconnect: ReturnType<typeof vi.fn>;
        connect: ReturnType<typeof vi.fn>;
      };
      // 顺序是契约的一部分：先 disconnect 才能把已有的 socket 与退避定时器收干净，
      // 直接 connect 会被 shouldConnect 挡住而什么都没发生。
      const order: string[] = [];
      provider.disconnect.mockImplementation(() => order.push("disconnect"));
      provider.connect.mockImplementation(() => order.push("connect"));

      act(() => result.current.reconnect());

      expect(order).toEqual(["disconnect", "connect"]);
      // 重连不该换会话：换了 Y.Doc 就地丢掉本地还没同步的改动
      expect(openCollabRoom).toHaveBeenCalledTimes(1);
      expect(fake.session.destroy).not.toHaveBeenCalled();
      expect(result.current.provider).toBe(fake.session.provider);
    });

    it("重连期间状态回到「连接中」，连接恢复后跟着 provider 变回已连接", async () => {
      const fake = createSession({ connected: true });
      openCollabRoom.mockResolvedValue(fake.session);
      const { result } = renderHook(() => useCollabRoom("index"));
      await waitFor(() => expect(result.current.status).toBe("connected"));

      act(() => result.current.reconnect());
      expect(result.current.status).toBe("connecting");

      act(() => fake.emit("status", { status: "connected" }));
      expect(result.current.status).toBe("connected");
    });

    it("会话尚未建立时重跑建立流程（换令牌失败后 provider 还是 null）", async () => {
      openCollabRoom.mockRejectedValueOnce(new Error("登录状态已过期"));
      const fake = createSession({ connected: true });
      openCollabRoom.mockResolvedValueOnce(fake.session);

      const { result } = renderHook(() => useCollabRoom("index"));
      await waitFor(() => expect(result.current.status).toBe("error"));

      act(() => result.current.reconnect());

      await waitFor(() => expect(result.current.status).toBe("connected"));
      expect(openCollabRoom).toHaveBeenCalledTimes(2);
      // 错误提示要跟着清掉，否则重连成功了页面上还挂着旧原因
      expect(result.current.error).toBeNull();
    });

    it("没有房间时不炸（provider 为 null）", () => {
      const { result } = renderHook(() => useCollabRoom(null));
      expect(() => {
        act(() => result.current.reconnect());
      }).not.toThrow();
      expect(result.current.status).toBe("disconnected");
    });
  });
});
