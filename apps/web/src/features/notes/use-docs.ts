"use client";

import { flattenedDtoQuerySerializer } from "@/lib/api/dto-query";
import { unwrapEnvelope } from "@/lib/api/errors";
import { noteApi } from "@/lib/api/openapi";
import { useQuery } from "@tanstack/react-query";
import { noteQueryKeys } from "./query-keys";
import { DEFAULT_PAGE_SIZE, type DocListItem, docListSchema, pageBeanSchema } from "./schemas";

const docPageSchema = pageBeanSchema(docListSchema);

export const DOC_PAGE_SIZE = DEFAULT_PAGE_SIZE;

/**
 * 某个知识库下的「资料」（PDF 文档）列表。
 *
 * `DocListDTO` 是 query 参数上的包装对象，后端按 `page` / `pageSize` /
 * `knowledgeBaseId` 三个平铺键读取（springdoc 的 `@ParameterObject` 行为），
 * 所以这里用 `flattenedDtoQuerySerializer` 而不是默认序列化器。
 */
export function useKnowledgeBaseDocsQuery(baseId: number) {
  return useQuery({
    queryKey: noteQueryKeys.docList(baseId),
    enabled: Number.isFinite(baseId) && baseId > 0,
    queryFn: async (): Promise<{ rows: DocListItem[]; total: number }> => {
      const { response } = await noteApi.GET("/docs", {
        params: {
          query: {
            docListDTO: { knowledgeBaseId: baseId, page: 1, pageSize: DOC_PAGE_SIZE },
          },
        },
        querySerializer: flattenedDtoQuerySerializer,
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, docPageSchema.parse);
      return { rows: page.rows, total: page.total ?? page.rows.length };
    },
  });
}
