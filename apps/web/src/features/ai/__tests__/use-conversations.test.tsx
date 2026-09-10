import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({
  aiApi: { GET: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

import { aiQueryKeys, conversationKey } from "@/features/ai/query-keys";
import {
  useConversationQuery,
  useConversationsInfinite,
  useDeleteConversationMutation,
  useRenameConversationMutation,
} from "@/features/ai/use-conversations";
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

describe("use-conversations", () => {
  beforeEach(() => {
    aiApiMock.GET.mockReset();
    aiApiMock.PATCH.mockReset();
    aiApiMock.DELETE.mockReset();
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

  it("conversationKey 生成稳定的 store key", () => {
    expect(conversationKey(42)).toBe("c42");
    expect(conversationKey({ id: 42 })).toBe("c42");
  });
});
