"use client";

import { ApiError, unwrapEnvelope } from "@/lib/api/errors";
import { flattenedDtoQuerySerializer } from "@/lib/api/dto-query";
import { aiApi, noteApi } from "@/lib/api/openapi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { aiQueryKeys } from "./query-keys";
import {
  DOC_INDEXED,
  type Doc,
  type DocDetail,
  type WorkflowData,
  docDetailSchema,
  docSchema,
  pageBeanSchema,
  workflowDataSchema,
} from "./schemas";

const docPageSchema = pageBeanSchema(docSchema);

export type DocPage = { rows: Doc[]; total: number; pages: number; page: number };

/** PDF 文档列表（按知识库）。knowledgeBaseId 传 0 表示未选择，不发起请求。 */
export function useDocsQuery(knowledgeBaseId: number) {
  return useQuery({
    queryKey: aiQueryKeys.docList(knowledgeBaseId),
    enabled: Number.isSafeInteger(knowledgeBaseId) && knowledgeBaseId > 0,
    placeholderData: (previous) => previous,
    queryFn: async (): Promise<DocPage> => {
      const { response } = await noteApi.GET("/docs", {
        // DocListDTO 是 ModelAttribute POJO：Spring 按平铺参数绑定（实测 bracket/dot 均不绑定），
        // springdoc 的包装对象只是呈现方式；pageSize 后端上限 50
        params: { query: { docListDTO: { knowledgeBaseId, page: 1, pageSize: 50 } } },
        querySerializer: flattenedDtoQuerySerializer,
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      const page = await unwrapEnvelope(response, docPageSchema.parse);
      return {
        rows: page.rows,
        total: page.total ?? page.rows.length,
        pages: page.pages ?? 1,
        page: page.current ?? 1,
      };
    },
  });
}

export function useDocQuery(docId: number) {
  return useQuery({
    queryKey: aiQueryKeys.docDetail(docId),
    enabled: Number.isSafeInteger(docId) && docId > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<DocDetail> => {
      const { response } = await noteApi.GET("/docs/{id}", {
        params: { path: { id: docId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, docDetailSchema.parse);
    },
  });
}

const createResEntitySchema = z.object({ id: z.number().nullish() });

/**
 * 上传 PDF 并建索引（两步合一个 mutation）：
 * 1. multipart POST /docs/pdfs（note 服务经内部 Feign 转存 file 服务）
 * 2. POST /docs/{id}/index 触发异步 RAG 索引（RocketMQ → ES），indexStatus 稍后变 1
 */
export function useUploadPdfMutation(uploadFn: typeof uploadPdf = uploadPdf) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      knowledgeBaseId,
      onProgress,
    }: {
      file: File;
      knowledgeBaseId: number;
      onProgress?: (percent: number) => void;
    }): Promise<number> => {
      const uploadId = crypto.randomUUID();
      const { id } = await uploadFn({
        file,
        knowledgeBaseId,
        uploadId,
        ...(onProgress ? { onProgress } : {}),
      });
      const { response } = await noteApi.POST("/docs/{id}/index", {
        params: { path: { id } },
        parseAs: "stream",
        signal: AbortSignal.timeout(30_000),
      });
      await unwrapEnvelope(response, () => undefined);
      return id;
    },
    retry: false,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: aiQueryKeys.docList(variables.knowledgeBaseId) });
    },
  });
}

export function useDeleteDocMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ docId, knowledgeBaseId }: { docId: number; knowledgeBaseId: number }) => {
      const { response } = await noteApi.DELETE("/docs/{id}", {
        params: { path: { id: docId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, () => undefined);
    },
    retry: false,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: aiQueryKeys.docList(variables.knowledgeBaseId) });
      queryClient.removeQueries({ queryKey: aiQueryKeys.docDetail(variables.docId) });
    },
  });
}

/** 轮询文档详情直到索引完成（indexStatus === 1）。索引走 RocketMQ 异步链路。 */
export function useDocIndexStatus(docId: number, options: { enabled: boolean }) {
  return useQuery({
    queryKey: ["ai", "docs", "detail", docId, "index-poll"],
    enabled: options.enabled && Number.isSafeInteger(docId) && docId > 0,
    refetchInterval: (query) =>
      query.state.data && query.state.data.indexStatus === DOC_INDEXED ? false : 3_000,
    refetchIntervalInBackground: false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<DocDetail> => {
      const { response } = await noteApi.GET("/docs/{id}", {
        params: { path: { id: docId } },
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, docDetailSchema.parse);
    },
  });
}

// ---------------------------------------------------------------------------
// AI 工作流画布数据的持久化在 features/ai/workflow-storage.ts（M7.2）。

// ---------------------------------------------------------------------------
// PDF 上传（XHR 以获得真实上传进度；fetch 没有上传进度事件）

export type UploadPdfArgs = {
  file: File;
  knowledgeBaseId: number;
  uploadId: string;
  onProgress?: ((percent: number) => void) | undefined;
};

export type XhrLike = {
  open: (method: string, url: string) => void;
  send: (body: FormData) => void;
  upload: {
    addEventListener: (type: "progress", listener: (event: ProgressEvent) => void) => void;
  };
  addEventListener: (
    type: "load" | "error",
    listener: (event: ProgressEvent | Event) => void,
  ) => void;
  status: number;
  responseText: string;
};

function defaultXhrFactory(): XhrLike {
  return new XMLHttpRequest() as unknown as XhrLike;
}

/**
 * multipart 直传 PDF 经 BFF 代理（/api/proxy/note/docs/pdfs）。
 *
 * 豁免 typed client 的原因：openapi-fetch 基于 fetch，没有上传进度事件；
 * M7.5 要求 50MB 文件上传进度平滑。请求仍是同源 BFF 路径，凭据由 Cookie 携带。
 */
export function uploadPdf(
  { file, knowledgeBaseId, uploadId, onProgress }: UploadPdfArgs,
  xhrFactory: () => XhrLike = defaultXhrFactory,
): Promise<{ id: number }> {
  return new Promise((resolve, reject) => {
    const xhr = xhrFactory();
    const formData = new FormData();
    formData.append("pdf", file);

    xhr.open(
      "POST",
      `/api/proxy/note/docs/pdfs?knowledgeBaseId=${knowledgeBaseId}&uploadId=${encodeURIComponent(uploadId)}`,
    );
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener("load", () => {
      const finish = async () => {
        try {
          const response = new Response(xhr.responseText, {
            status: xhr.status,
            headers: { "content-type": "application/json" },
          });
          const parsed = await unwrapEnvelope(response, createResEntitySchema.parse);
          if (!parsed.id) {
            throw new ApiError(xhr.status, "B0500", "服务未返回文档 ID");
          }
          resolve({ id: parsed.id });
        } catch (error) {
          reject(error);
        }
      };
      void finish();
    });
    xhr.addEventListener("error", () => {
      reject(new ApiError(0, "A0500", "上传失败，请检查网络后重试"));
    });
    xhr.send(formData);
  });
}
