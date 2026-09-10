"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { noteQueryKeys } from "./query-keys";
import {
  ALL_BASE_PERMISSIONS,
  type CreateBaseInput,
  DEFAULT_BASE_COVER,
  DEFAULT_PAGE_SIZE,
  type KnowledgeBase,
  knowledgeBaseSchema,
  pageBeanSchema,
} from "./schemas";

const basePageSchema = pageBeanSchema(knowledgeBaseSchema);

/**
 * 当前用户可见的知识库列表。
 *
 * 后端 `/bases` 的 permissions 是 `<=` 过滤，传枚举最大值即「全部我参与的知识库」。
 */
export function useKnowledgeBasesQuery(permissions: number = ALL_BASE_PERMISSIONS) {
  return useQuery({
    queryKey: noteQueryKeys.baseList(permissions),
    queryFn: async (): Promise<KnowledgeBase[]> => {
      const { response } = await noteApi.GET("/bases", {
        params: { query: { page: 1, pageSize: DEFAULT_PAGE_SIZE, permissions } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, basePageSchema.parse);
      return page.rows;
    },
  });
}

/** 知识库详情：面包屑与页头用，命中列表缓存时不会重复请求。 */
export function useKnowledgeBaseQuery(baseId: number) {
  return useQuery({
    queryKey: noteQueryKeys.baseDetail(baseId),
    enabled: Number.isFinite(baseId) && baseId > 0,
    queryFn: async (): Promise<KnowledgeBase> => {
      const { response } = await noteApi.GET("/bases/{id}", {
        params: { path: { id: baseId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, knowledgeBaseSchema.parse);
    },
  });
}

/** 新建知识库；后端要求 cover 非空，未上传封面时落到默认图。 */
export function useCreateKnowledgeBaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBaseInput): Promise<number> => {
      const { response } = await noteApi.POST("/bases", {
        body: {
          name: input.name,
          detail: input.detail,
          cover: DEFAULT_BASE_COVER,
          type: 0,
        },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const created = await unwrapEnvelope(response, (data) =>
        knowledgeBaseSchema.pick({ id: true }).parse(data),
      );
      return created.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteQueryKeys.bases }),
    retry: false,
  });
}
