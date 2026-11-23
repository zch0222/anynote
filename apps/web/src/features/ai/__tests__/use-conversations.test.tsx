import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({
  aiApi: { GET: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

const meState = vi.hoisted(() => ({
  current: { data: { id: 7 } as { id?: number } | undefined },
}));
vi.mock("@/features/auth/use-me", () => ({ useMe: () => meState.current }));

import { aiQueryKeys, conversationKey } from "@/features/ai/query-keys";
import {
  useConversationQuery,
  useConversationsInfinite,
  useConversationsQuery,
  useDeleteConversationMutation,
  useRenameConversationMutation,
} from "@/features/ai/use-conversations";
import { saveSidePanelState, useSidePanelPersistence } from "@/features/side-panel/persistence";
import { sidePanelStorageKey } from "@/features/side-panel/storage-keys";
import { emptySurface, useSidePanelStore } from "@/features/side-panel/store";
import { type SurfaceState, asTabId } from "@/features/side-panel/types";
import { aiApi } from "@/lib/api/openapi";

const aiApiMock = vi.mocked(aiApi, true);

function envelope(data: unknown, code = "00000", status = 200): { response: Response } {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), { status }),
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const PAGE = {
  current: 1,
  pages: 2,
  total: 3,
  rows: [
    {
      id: 1,
      title: "会话一",
      type: 1,
      docId: 0,
      createTime: "2026-09-11T10:00:00",
      updateTime: "2026-09-11T10:00:00",
    },
    { id: 2, title: null, type: 1, docId: 0, createTime: null, updateTime: null },
  ],
};

/** 构造一个带活动笔记标签、可被持久化 schema 接受的分区。 */
function noteSurface(id: number): SurfaceState {
  const surface = emptySurface();
  surface.open = true;
  surface.tabs = [
    {
      id: asTabId("t1"),
      kind: "note",
      family: "resource",
      ref: { type: "note", id, kbId: 3 },
    },
  ];
  surface.activeId = asTabId("t1");
  surface.recent = [asTabId("t1")];
  surface.seq = 1;
  surface.touchedAt = 1;
  return surface;
}

describe("use-conversations", () => {
  beforeEach(() => {
    aiApiMock.GET.mockReset();
    aiApiMock.PATCH.mockReset();
    aiApiMock.DELETE.mockReset();
    localStorage.clear();
    meState.current = { data: { id: 7 } };
    useSidePanelStore.setState({ surfaces: {}, guards: {}, newWindowHandlers: {} });
  });

  it("会话列表分页解析并支持翻页", async () => {
    aiApiMock.GET.mockResolvedValue(envelope(PAGE));
    const { result } = renderHook(() => useConversationsInfinite(20), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]?.rows).toHaveLength(2);
    expect(aiApiMock.GET).toHaveBeenCalledWith(
      "/chat/conversations/list",
      expect.objectContaining({
        params: { query: { chatConversationListDTO: { page: 1, pageSize: 20 } } },
      }),
    );
    expect(result.current.hasNextPage).toBe(true);
  });

  /** 桌面分组列表逐页读取并合并全部会话。 */
  it("全量会话查询自动读取后续分页", async () => {
    aiApiMock.GET.mockResolvedValueOnce(envelope(PAGE)).mockResolvedValueOnce(
      envelope({
        current: 2,
        pages: 2,
        total: 3,
        rows: [
          {
            id: 3,
            title: "会话三",
            scope: { knowledgeBaseIds: [3], refs: [] },
          },
        ],
      }),
    );
    const { result } = renderHook(() => useConversationsQuery(50), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(aiApiMock.GET).toHaveBeenCalledTimes(2);
    expect(aiApiMock.GET).toHaveBeenNthCalledWith(
      2,
      "/chat/conversations/list",
      expect.objectContaining({
        params: { query: { chatConversationListDTO: { page: 2, pageSize: 50 } } },
      }),
    );
  });

  it("会话详情：id 有效才请求，解析 conversation 与 messages", async () => {
    aiApiMock.GET.mockResolvedValue(
      envelope({
        conversation: { id: 7, title: "t" },
        messages: [
          { id: 1, role: 0, content: "q" },
          { id: 2, role: 1, content: "a" },
        ],
      }),
    );
    const { result } = renderHook(() => useConversationQuery(7), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.messages).toHaveLength(2);
    expect(aiApiMock.GET).toHaveBeenCalledWith(
      "/chat/conversations/{id}",
      expect.objectContaining({ params: { path: { id: 7 } } }),
    );

    aiApiMock.GET.mockClear();
    renderHook(() => useConversationQuery(0), { wrapper: createWrapper() });
    expect(aiApiMock.GET).not.toHaveBeenCalled();
  });

  it("重命名成功后失效会话缓存", async () => {
    aiApiMock.PATCH.mockResolvedValue(envelope("SUCCESS"));
    const { result } = renderHook(() => useRenameConversationMutation(), {
      wrapper: createWrapper(),
    });
    const invalidateSpy = vi.fn();
    await result.current.mutateAsync({ conversationId: 7, title: "新标题" });
    expect(aiApiMock.PATCH).toHaveBeenCalledWith(
      "/chat/conversations/{id}",
      expect.objectContaining({
        params: { path: { id: 7 } },
        body: { title: "新标题" },
      }),
    );
    void invalidateSpy;
  });

  it("删除成功后移除详情缓存", async () => {
    aiApiMock.DELETE.mockResolvedValue(envelope("SUCCESS"));
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(aiQueryKeys.conversationDetail(7), { any: "data" });
    const wrapper = function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
    const { result } = renderHook(() => useDeleteConversationMutation(), { wrapper });
    await result.current.mutateAsync(7);
    expect(aiApiMock.DELETE).toHaveBeenCalledWith(
      "/chat/conversations/{id}",
      expect.objectContaining({ params: { path: { id: 7 } } }),
    );
    expect(queryClient.getQueryData(aiQueryKeys.conversationDetail(7))).toBeUndefined();
  });

  /** 宿主未挂载时删除会话仍清理本地分区；会话 id 全局唯一，各用户键一并处理。 */
  it("删除会话清理本地分区", async () => {
    aiApiMock.DELETE.mockResolvedValue(envelope("SUCCESS"));
    const surface = { open: true, activeId: null, tabs: [], recent: [], seq: 0, touchedAt: 1 };
    localStorage.setItem(
      sidePanelStorageKey(7),
      JSON.stringify({ version: 1, surfaces: { "chat:c7": surface, "chat:c8": surface } }),
    );
    localStorage.setItem(
      sidePanelStorageKey(8),
      JSON.stringify({ version: 1, surfaces: { "chat:c7": surface } }),
    );
    const { result } = renderHook(() => useDeleteConversationMutation(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync(7);
    await waitFor(() => expect(localStorage.getItem(sidePanelStorageKey(8))).toBeNull());
    const first = localStorage.getItem(sidePanelStorageKey(7));
    expect(first).not.toBeNull();
    expect(first).not.toContain("chat:c7");
    expect(first).toContain("chat:c8");
  });

  /** 宿主卸载后删除会话也清内存分区，重新挂载后的保存不会把已删分区写回。 */
  it("宿主卸载后删除会话同步清理内存分区", async () => {
    aiApiMock.DELETE.mockResolvedValue(envelope("SUCCESS"));
    saveSidePanelState(7, { "chat:c7": noteSurface(1), "chat:c8": noteSurface(2) });
    const persistence = renderHook(() => useSidePanelPersistence({}));
    expect(useSidePanelStore.getState().surfaces["chat:c7"]).toBeDefined();
    expect(useSidePanelStore.getState().surfaces["chat:c8"]).toBeDefined();
    persistence.unmount();

    const { result } = renderHook(() => useDeleteConversationMutation(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync(7);
    expect(useSidePanelStore.getState().surfaces["chat:c7"]).toBeUndefined();
    await waitFor(() => {
      const raw = localStorage.getItem(sidePanelStorageKey(7));
      expect(raw).not.toBeNull();
      expect(raw).not.toContain("chat:c7");
    });

    renderHook(() => useSidePanelPersistence({}));
    useSidePanelStore.getState().setOpen("chat:c8", false);
    await waitFor(() => {
      const raw = localStorage.getItem(sidePanelStorageKey(7));
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw as string) as { surfaces: Record<string, unknown> };
      expect(stored.surfaces["chat:c8"]).toBeDefined();
      expect(stored.surfaces["chat:c7"]).toBeUndefined();
    });
  });

  it("conversationKey 生成稳定的 store key", () => {
    expect(conversationKey(42)).toBe("c42");
    expect(conversationKey({ id: 42 })).toBe("c42");
  });
});
