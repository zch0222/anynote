"use client";

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

/** 会话列表（分页「加载更多」）：会话持久化在 AI 服务，按 updateTime 倒序。 */
export function useConversationsInfinite(pageSize: number = PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: aiQueryKeys.conversationList(pageSize),
    initialPageParam: 1,
    queryFn: async ({ pageParam, signal }): Promise<ConversationPage> => {
      const { response } = await aiApi.GET("/chat/conversations/list", {
        params: { query: { chatConversationListDTO: { page: pageParam, pageSize } } },
        querySerializer: flattenedDtoQuerySerializer,
        parseAs: "stream",
        signal,
      });
      const page = await unwrapEnvelope(response, conversationPageSchema.parse);
      return {
        rows: page.rows,
        total: page.total ?? page.rows.length,
        pages: page.pages ?? 1,
        page: pageParam,
      };
    },
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
      queryClient.invalidateQueries({ queryKey: aiQueryKeys.conversations });
      queryClient.removeQueries({ queryKey: aiQueryKeys.conversationDetail(conversationId) });
    },
  });
}
