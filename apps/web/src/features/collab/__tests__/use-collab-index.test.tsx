import { useCollabIndex } from "@/features/collab/use-collab-index";
import type { CollabRoomState } from "@/features/collab/use-collab-room";
import { type CollabDocMeta, appendDocEntry, readDocIndex } from "@/lib/collab/index-doc";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const useCollabRoom = vi.hoisted(() => vi.fn());
vi.mock("@/features/collab/use-collab-room", () => ({ useCollabRoom }));

let doc: Y.Doc;

function roomState(overrides: Partial<CollabRoomState> = {}): CollabRoomState {
  return {
    doc,
    provider: null,
    user: { id: "7", name: "小明", color: "#2563eb" },
    status: "connected",
    error: null,
    peers: [],
    ...overrides,
  };
}

beforeEach(() => {
  doc = new Y.Doc();
  useCollabRoom.mockReturnValue(roomState());
});

describe("useCollabIndex", () => {
  it("连的是索引房间", () => {
    renderHook(() => useCollabIndex());
    expect(useCollabRoom).toHaveBeenCalledWith("index");
  });

  it("初次渲染就读出索引里已有的文档", async () => {
    appendDocEntry(doc, {
      id: "abcdefgh",
      title: "既有文档",
      createdAt: 1,
      updatedAt: 1,
      createdBy: "小红",
    });

    const { result } = renderHook(() => useCollabIndex());

    await waitFor(() => expect(result.current.docs).toHaveLength(1));
    expect(result.current.docs[0]?.title).toBe("既有文档");
  });

  it("远端新增条目会实时出现在列表里", async () => {
    const { result } = renderHook(() => useCollabIndex());
    const remote = new Y.Doc();

    act(() => {
      appendDocEntry(remote, {
        id: "bbbbbbbb",
        title: "别人新建的",
        createdAt: 2,
        updatedAt: 2,
        createdBy: "小红",
      });
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
    });

    await waitFor(() =>
      expect(result.current.docs.map((item) => item.title)).toEqual(["别人新建的"]),
    );
  });

  it("远端改标题（条目内部变化）也能收到——deep 观察而非只听顶层数组", async () => {
    appendDocEntry(doc, {
      id: "abcdefgh",
      title: "旧标题",
      createdAt: 1,
      updatedAt: 1,
      createdBy: "小红",
    });
    const { result } = renderHook(() => useCollabIndex());
    await waitFor(() => expect(result.current.docs[0]?.title).toBe("旧标题"));

    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    act(() => {
      remote.getArray<Y.Map<unknown>>("documents").get(0)?.set("title", "远端改的标题");
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
    });

    await waitFor(() => expect(result.current.docs[0]?.title).toBe("远端改的标题"));
  });

  it("createDoc 写入索引并回传可用于跳转的元数据", async () => {
    const { result } = renderHook(() => useCollabIndex());

    // 用对象持有返回值：直接写局部变量的话 TS 会把它一路收窄成 null
    const created: { value: CollabDocMeta | null } = { value: null };
    act(() => {
      created.value = result.current.createDoc("新文档");
    });

    expect(created.value).toMatchObject({ title: "新文档", createdBy: "小明" });
    await waitFor(() => expect(result.current.docs).toHaveLength(1));
    expect(readDocIndex(doc)[0]?.id).toBe(created.value?.id);
  });

  it("未连接（没有 doc / user）时写操作是安全的空操作", () => {
    useCollabRoom.mockReturnValue(roomState({ doc: null, user: null, status: "connecting" }));
    const { result } = renderHook(() => useCollabIndex());

    expect(result.current.createDoc("x")).toBeNull();
    expect(result.current.renameDoc("abcdefgh", "x")).toBe(false);
    expect(result.current.touchDoc("abcdefgh")).toBe(false);
    expect(result.current.removeDoc("abcdefgh")).toBe(false);
    expect(result.current.docs).toEqual([]);
  });

  it("renameDoc / touchDoc / removeDoc 反映到列表", async () => {
    const { result } = renderHook(() => useCollabIndex());
    let id = "";
    act(() => {
      id = result.current.createDoc("初始")?.id ?? "";
    });
    await waitFor(() => expect(result.current.docs).toHaveLength(1));

    act(() => {
      result.current.renameDoc(id, "改过的");
    });
    await waitFor(() => expect(result.current.docs[0]?.title).toBe("改过的"));

    act(() => {
      expect(result.current.touchDoc(id)).toBe(true);
      expect(result.current.removeDoc(id)).toBe(true);
    });
    await waitFor(() => expect(result.current.docs).toEqual([]));
  });

  it("透传房间状态，便于页面展示连接情况", () => {
    useCollabRoom.mockReturnValue(roomState({ status: "error", error: new Error("连不上") }));
    const { result } = renderHook(() => useCollabIndex());

    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe("连不上");
  });
});
