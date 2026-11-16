"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import {
  ALL_BASE_PERMISSIONS,
  type KnowledgeBase,
  knowledgeBaseSchema,
  pageBeanSchema,
} from "@anynote/api-core/note-schemas";
import { useQuery } from "@tanstack/react-query";

const pageSchema = pageBeanSchema(knowledgeBaseSchema);

/**
 * 读取全部可见知识库，供聊天范围选择。
 *
 * @author 称霸幼儿园
 */
export function useChatKnowledgeBasesQuery() {
  return useQuery({
    queryKey: ["ai", "scope-bases"],
    queryFn: async ({ signal }): Promise<KnowledgeBase[]> => {
      const bases = new Map<number, KnowledgeBase>();
      let page = 1;
      let pages = 1;
      do {
        const { response } = await noteApi.GET("/bases", {
          params: { query: { page, pageSize: 20, permissions: ALL_BASE_PERMISSIONS } },
          parseAs: "stream",
          signal,
        });
        const result = await unwrapEnvelope(response, pageSchema.parse);
        for (const base of result.rows) bases.set(base.id, base);
        pages = result.pages ?? 1;
        page++;
      } while (page <= pages);
      return [...bases.values()];
    },
  });
}
