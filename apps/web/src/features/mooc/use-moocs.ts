"use client";

import { flattenedDtoQuerySerializer } from "@/lib/api/dto-query";
import { ApiError, unwrapEnvelope } from "@/lib/api/errors";
import { fileApi, noteApi } from "@/lib/api/openapi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { moocQueryKeys } from "./query-keys";
import {
  type Mooc,
  type MoocItem,
  type MoocItemDetail,
  type ObjectUrl,
  moocItemDetailSchema,
  moocItemPageSchema,
  moocPageSchema,
  objectUrlSchema,
} from "./schemas";

export const MOOC_PAGE_SIZE = 50;

/** 某个知识库下的课程列表（MoocListDTO 必填 knowledgeId）。 */
export function useMoocsQuery(knowledgeId: number) {
  return useQuery({
    queryKey: moocQueryKeys.list(knowledgeId),
    enabled: Number.isSafeInteger(knowledgeId) && knowledgeId > 0,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<{ rows: Mooc[]; total: number }> => {
      const { response } = await noteApi.GET("/moocs", {
        params: { query: { moocListDTO: { knowledgeId, page: 1, pageSize: MOOC_PAGE_SIZE } } },
        querySerializer: flattenedDtoQuerySerializer,
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, moocPageSchema.parse);
      return { rows: page.rows, total: page.total ?? page.rows.length };
    },
  });
}

/** 课程条目（按父级；parentId=0 为顶层章节/内容）。 */
export function useMoocItemsQuery(moocId: number, parentId: number) {
  return useQuery({
    queryKey: moocQueryKeys.items(moocId, parentId),
    enabled: Number.isSafeInteger(moocId) && moocId > 0,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<MoocItem[]> => {
      const { response } = await noteApi.GET("/moocs/items", {
        params: {
          query: { moocItemListDTO: { moocId, parentId, page: 1, pageSize: MOOC_PAGE_SIZE } },
        },
        querySerializer: flattenedDtoQuerySerializer,
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, moocItemPageSchema.parse);
      return page.rows;
    },
  });
}

/** 条目详情（视频取 objectName，文档取 moocItemText）。 */
export function useMoocItemQuery(moocId: number, moocItemId: number) {
  return useQuery({
    queryKey: moocQueryKeys.itemDetail(moocId, moocItemId),
    enabled: Number.isSafeInteger(moocItemId) && moocItemId > 0,
    queryFn: async (): Promise<MoocItemDetail> => {
      const { response } = await noteApi.GET("/moocs/items/{moocItemId}", {
        params: { path: { moocItemId }, query: { moocId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, moocItemDetailSchema.parse);
    },
  });
}

/** OBS 对象名 → 临时播放地址（file 域 public/byObjectName，URL 有过期时间）。 */
export function useObjectUrlQuery(objectName: string | null | undefined) {
  return useQuery({
    queryKey: moocQueryKeys.objectUrl(objectName ?? ""),
    enabled: Boolean(objectName),
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<ObjectUrl> => {
      const { response } = await fileApi.GET("/public/byObjectName", {
        params: { query: { objectName: objectName as string } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, objectUrlSchema.parse);
    },
  });
}

const createResSchema = z.number().nullish();

/** 新建课程（MoocCreateDTO 必填 title/knowledgeBaseId/cover；封面用默认图）。 */
export function useCreateMoocMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      moocDescription,
      knowledgeBaseId,
    }: {
      title: string;
      moocDescription?: string | undefined;
      knowledgeBaseId: number;
    }) => {
      const { response } = await noteApi.POST("/moocs", {
        body: {
          title,
          knowledgeBaseId,
          cover: DEFAULT_MOOC_COVER,
          // n_mooc.data_scope 列 NOT NULL 且无默认值，创建时不传会触发后端 B0001
          dataScope: 1,
          ...(moocDescription ? { moocDescription } : {}),
        },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const id = await unwrapEnvelope(response, createResSchema.parse);
      if (!id) {
        throw new ApiError(200, "B0500", "服务未返回课程 ID");
      }
      return id;
    },
    retry: false,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: moocQueryKeys.list(variables.knowledgeBaseId) });
    },
  });
}

export const DEFAULT_MOOC_COVER =
  "https://anynote.obs.cn-east-3.myhuaweicloud.com/images/knowledge_base_cover.png";
