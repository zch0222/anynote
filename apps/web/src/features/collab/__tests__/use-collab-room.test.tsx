import { useCollabRoom } from "@/features/collab/use-collab-room";
import type { CollabSession } from "@/lib/collab/session";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const openCollabRoom = vi.hoisted(() => vi.fn());
vi.mock("@/lib/collab/session", () => ({ openCollabRoom }));

type Listener = (payload: never) => void;

/** 够用的假会话：只实现 hook 真正触碰到的那几个成员。 */
function createSession(options: { connected?: boolean } = {}) {
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
});
