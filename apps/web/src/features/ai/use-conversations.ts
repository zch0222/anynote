"use client";

import { notifyConversationRemoved } from "@/features/side-panel/surface-events";
import { flattenedDtoQuerySerializer } from "@/lib/api/dto-query";
import { unwrapEnvelope } from "@/lib/api/errors";
import { aiApi } from "@/lib/api/openapi";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiQueryKeys } from "./query-keys";
import {
  type Conversation,
  type ConversationDetail,
  PAGE_SIZE,
  conversationDetailSchema,
  conversationSchema,
  pageBeanSchema,
} from "./schemas";

const conversationPageSchema = pageBeanSchema(conversationSchema);

export type ConversationPage = { rows: Conversation[]; total: number; pages: number; page: number };

const ALL_CONVERSATIONS_PAGE_SIZE = 50;

/**
 * 读取一页会话并解析服务端分页信封。
 *
 * @param page 页码，从 1 开始
 * @param pageSize 每页会话数
 * @param signal 请求取消信号
 * @returns 会话分页
 * @author 称霸幼儿园
 */
async function fetchConversationPage(
  page: number,
  pageSize: number,
  signal: AbortSignal,
): Promise<ConversationPage> {
  const { response } = await aiApi.GET("/chat/conversations/list", {
    params: { query: { chatConversationListDTO: { page, pageSize } } },
    querySerializer: flattenedDtoQuerySerializer,
    parseAs: "stream",
    signal,
  });
  const result = await unwrapEnvelope(response, conversationPageSchema.parse);
  return {
    rows: result.rows,
    total: result.total ?? result.rows.length,
    pages: result.pages ?? 1,
    page,
  };
}

/**
 * 读取当前用户全部会话，供桌面端知识库分组列表使用。
 *
 * @param pageSize 每次请求的分页大小
 * @author 称霸幼儿园
 */
export function useConversationsQuery(pageSize: number = ALL_CONVERSATIONS_PAGE_SIZE) {
  return useQuery({
    queryKey: aiQueryKeys.conversationAll(pageSize),
    queryFn: async ({ signal }): Promise<Conversation[]> => {
      const conversations = new Map<number, Conversation>();
      let page = 1;
      let pages = 1;
      do {
        const result = await fetchConversationPage(page, pageSize, signal);
        for (const row of result.rows) conversations.set(row.id, row);
        pages = result.pages;
        page++;
      } while (page <= pages);
      return [...conversations.values()];
    },
  });
}

/** 会话列表（分页「加载更多」）：会话持久化在 AI 服务，按 updateTime 倒序。 */
export function useConversationsInfinite(pageSize: number = PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: aiQueryKeys.conversationList(pageSize),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchConversationPage(pageParam, pageSize, signal),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
}

/** 会话详情（消息历史）。conversationId 传 0 表示未选中，不发起请求。 */
export function useConversationQuery(conversationId: number) {
  return useQuery({
    queryKey: aiQueryKeys.conversationDetail(conversationId),
    enabled: Number.isSafeInteger(conversationId) && conversationId > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<ConversationDetail> => {
      const { response } = await aiApi.GET("/chat/conversations/{id}", {
        params: { path: { id: conversationId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, conversationDetailSchema.parse);
    },
  });
}

export function useRenameConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, title }: { conversationId: number; title: string }) => {
      const { response } = await aiApi.PATCH("/chat/conversations/{id}", {
        params: { path: { id: conversationId } },
        body: { title },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, () => undefined);
    },
    retry: false,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: aiQueryKeys.conversations });
      queryClient.invalidateQueries({
        queryKey: aiQueryKeys.conversationDetail(variables.conversationId),
      });
    },
  });
}

export function useDeleteConversationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: number) => {
      const { response } = await aiApi.DELETE("/chat/conversations/{id}", {
        params: { path: { id: conversationId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, () => undefined);
    },
    retry: false,
    onSuccess: (_data, conversationId) => {
      notifyConversationRemoved(conversationId);
      queryClient.invalidateQueries({ queryKey: aiQueryKeys.conversations });
      queryClient.removeQueries({ queryKey: aiQueryKeys.conversationDetail(conversationId) });
    },
  });
}
