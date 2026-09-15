"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { noteQueryKeys } from "./query-keys";
import {
  ALL_BASE_PERMISSIONS,
  type CreateBaseInput,
  DEFAULT_BASE_COVER,
  DEFAULT_PAGE_SIZE,
  type KnowledgeBase,
  type KnowledgeBaseMember,
  baseMemberSchema,
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

const organizationBasePageSchema = pageBeanSchema(knowledgeBaseSchema);

/**
 * 当前用户所属**组织**的知识库（设计稿的「组织」分段）。
 *
 * 与 `useKnowledgeBasesQuery` 是两个后端端点，口径不同：
 * `/bases` 是 `type=0`（普通知识库）+ `permissions <= n`，
 * `/bases/organizations` 是 `type=1`（组织知识库）+ 数据范围过滤。
 * 因此缓存也分两棵子树，不能互相复用。
 */
export function useOrganizationKnowledgeBasesQuery() {
  return useQuery({
    queryKey: noteQueryKeys.organizationBases,
    queryFn: async (): Promise<KnowledgeBase[]> => {
      const { response } = await noteApi.GET("/bases/organizations", {
        params: { query: { page: 1, pageSize: DEFAULT_PAGE_SIZE } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, organizationBasePageSchema.parse);
      return page.rows;
    },
  });
}

/**
 * 我**管理**的知识库（设计稿的「我的」分段）。
 *
 * 走 `/bases/managerList` 而不是在 `/bases` 上按 `permissions` 过滤：
 * 后者的 `permissions` 是"我的权限"，`MANAGE=1` 恰好也能筛出我管理的库，
 * 但 `selectUserKnowledgeBaseList` 里那条 `<if test="permissions != null">`
 * 套在 `LEFT JOIN n_user_knowledge_base` 上，`permissions` 一旦非空就等于
 * 把"我参与的"当成全集再取子集——两者结果虽同，语义却依赖 SQL 细节。
 * `managerList` 是专门为此写的查询（`permissions > 1` 的关联表过滤），
 * 语义明确，所以用它。
 */
export function useManagedKnowledgeBasesQuery(userId: number, organizationId = 0) {
  return useQuery({
    queryKey: noteQueryKeys.managedBases(userId, organizationId),
    enabled: Number.isSafeInteger(userId) && userId > 0,
    queryFn: async (): Promise<KnowledgeBase[]> => {
      const { response } = await noteApi.GET("/bases/managerList", {
        params: {
          query: { page: 1, pageSize: DEFAULT_PAGE_SIZE, type: 0, status: 0, organizationId },
        },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, organizationBasePageSchema.parse);
      return page.rows;
    },
  });
}

const baseMemberPageSchema = pageBeanSchema(baseMemberSchema);

/** 知识库成员列表（设计稿「成员」Tab）。用户名传空串表示不按用户名过滤。 */
export function useKnowledgeBaseMembersQuery(
  baseId: number,
  { username = "", page = 1, pageSize = DEFAULT_PAGE_SIZE } = {},
) {
  return useQuery({
    queryKey: noteQueryKeys.baseMembers(baseId, username),
    enabled: Number.isFinite(baseId) && baseId > 0,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: KnowledgeBaseMember[]; total: number }> => {
      const { response } = await noteApi.GET("/bases/users", {
        params: { query: { knowledgeBaseId: baseId, page, pageSize, username } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const result = await unwrapEnvelope(response, baseMemberPageSchema.parse);
      return { rows: result.rows, total: result.total ?? result.rows.length };
    },
  });
}

/**
 * 移除知识库成员（D-09 图例 16）。
 *
 * 后端禁止移除自己，前端则在「自己那行」干脆不出菜单——不靠后端兜底是因为
 * "点了才被拒绝"对用户是白跑一趟。
 *
 * 失效的是**整棵成员子树**（`baseMembersRoot`）而不是当前关键词下的那一条：
 * 同一个用户可能同时出现在多个搜索结果里，只清当前 key 会让改完关键词再搜时
 * 又看到已经移除的人。
 */
export function useRemoveMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      knowledgeBaseId,
    }: {
      userId: number;
      knowledgeBaseId: number;
    }): Promise<void> => {
      const { response } = await noteApi.DELETE("/bases/users", {
        params: { query: { userId, knowledgeBaseId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      await unwrapEnvelope(response, z.unknown().parse);
    },
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteQueryKeys.baseMembersRoot }),
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
