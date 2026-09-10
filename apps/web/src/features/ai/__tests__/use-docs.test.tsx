import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
  aiApi: { GET: vi.fn() },
}));

import { workflowDataSchema } from "@/features/ai/schemas";
import {
  uploadPdf,
  useDeleteDocMutation,
  useDocsQuery,
  useUploadPdfMutation,
} from "@/features/ai/use-docs";
import {
  loadWorkflow,
  runWorkflow,
  saveWorkflow,
  validateWorkflow,
} from "@/features/ai/workflow-storage";
import { noteApi } from "@/lib/api/openapi";

const noteApiMock = vi.mocked(noteApi, true);

function envelope(data: unknown, code = "00000"): { response: Response } {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), { status: 200 }),
  };
}

function wrapperWith(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("use-docs", () => {
  beforeEach(() => {
    noteApiMock.GET.mockReset();
    noteApiMock.POST.mockReset();
    noteApiMock.DELETE.mockReset();
    window.localStorage.clear();
  });

  it("文档列表：query 走 docListDTO 包装参数，id 无效时不请求", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope({
        current: 1,
        pages: 1,
        total: 1,
        rows: [{ id: 5, docName: "a.pdf", indexStatus: 1 }],
      }),
    );
    const { result } = renderHook(() => useDocsQuery(3), {
      wrapper: wrapperWith(new QueryClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/docs",
      expect.objectContaining({
        params: { query: { docListDTO: { knowledgeBaseId: 3, page: 1, pageSize: 50 } } },
      }),
    );
    expect(result.current.data?.rows[0]?.docName).toBe("a.pdf");

    noteApiMock.GET.mockClear();
    renderHook(() => useDocsQuery(0), { wrapper: wrapperWith(new QueryClient()) });
    expect(noteApiMock.GET).not.toHaveBeenCalled();
  });

  it("上传 PDF mutation：上传 + 触发索引，成功后失效列表", async () => {
    noteApiMock.POST.mockResolvedValueOnce(envelope("SUCCESS")); // /docs/{id}/index
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const fakeUpload = vi.fn(async () => ({ id: 12 }));
    const { result } = renderHook(() => useUploadPdfMutation(fakeUpload), {
      wrapper: wrapperWith(queryClient),
    });

    const id = await result.current.mutateAsync({
      file: new File(["pdf"], "doc.pdf", { type: "application/pdf" }),
      knowledgeBaseId: 3,
    });
    expect(id).toBe(12);
    expect(fakeUpload).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeBaseId: 3, uploadId: expect.any(String) }),
    );
    expect(noteApiMock.POST).toHaveBeenCalledWith(
      "/docs/{id}/index",
      expect.objectContaining({ params: { path: { id: 12 } } }),
    );
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it("删除文档成功后失效列表并移除详情", async () => {
    noteApiMock.DELETE.mockResolvedValue(envelope("SUCCESS"));
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useDeleteDocMutation(), {
      wrapper: wrapperWith(queryClient),
    });
    await result.current.mutateAsync({ docId: 5, knowledgeBaseId: 3 });
    expect(noteApiMock.DELETE).toHaveBeenCalledWith(
      "/docs/{id}",
      expect.objectContaining({ params: { path: { id: 5 } } }),
    );
  });
});

describe("uploadPdf（XHR 上传）", () => {
  function fakeXhr(status: number, body: string) {
    const listeners = new Map<string, (event: unknown) => void>();
    const xhr = {
      open: vi.fn(),
      send: vi.fn(() => {
        // 模拟一次进度 + 完成事件（upload 事件监听带 u- 前缀存储）
        listeners.get("u-progress")?.({ lengthComputable: true, loaded: 50, total: 100 });
        xhr.status = status;
        xhr.responseText = body;
        listeners.get("load")?.(new Event("load"));
      }),
      upload: {
        addEventListener: (type: string, fn: (event: unknown) => void) =>
          listeners.set(`u-${type}`, fn),
      },
      addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
      status: 0,
      responseText: "",
    };
    return xhr;
  }

  it("POST BFF 代理路径并携带 query，进度回调可用，信封拆包返回 id", async () => {
    const xhr = fakeXhr(200, JSON.stringify({ code: "00000", msg: "ok", data: { id: 33 } }));
    const onProgress = vi.fn();
    const promise = uploadPdf(
      {
        file: new File(["x"], "a.pdf", { type: "application/pdf" }),
        knowledgeBaseId: 3,
        uploadId: "u-1",
        onProgress,
      },
      () => xhr as unknown as import("@/features/ai/use-docs").XhrLike,
    );
    const { id } = await promise;
    expect(id).toBe(33);
    expect(xhr.open).toHaveBeenCalledWith(
      "POST",
      "/api/proxy/note/docs/pdfs?knowledgeBaseId=3&uploadId=u-1",
    );
    expect(onProgress).toHaveBeenCalledWith(50);
    expect(xhr.send).toHaveBeenCalledWith(expect.any(FormData));
  });

  it("业务错误码 reject ApiError", async () => {
    const xhr = fakeXhr(200, JSON.stringify({ code: "A0160", msg: "参数错误" }));
    await expect(
      uploadPdf(
        {
          file: new File(["x"], "a.pdf", { type: "application/pdf" }),
          knowledgeBaseId: 3,
          uploadId: "u-2",
        },
        () => xhr as unknown as import("@/features/ai/use-docs").XhrLike,
      ),
    ).rejects.toMatchObject({ code: "A0160" });
  });

  it("网络错误 reject", async () => {
    const listeners = new Map<string, () => void>();
    const xhr = {
      open: vi.fn(),
      send: vi.fn(() => {
        listeners.get("error")?.();
      }),
      upload: {
        addEventListener: (type: string, fn: () => void) => listeners.set(`u-${type}`, fn),
      },
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      status: 0,
      responseText: "",
    };
    await expect(
      uploadPdf(
        {
          file: new File(["x"], "a.pdf", { type: "application/pdf" }),
          knowledgeBaseId: 3,
          uploadId: "u-3",
        },
        () => xhr as unknown as import("@/features/ai/use-docs").XhrLike,
      ),
    ).rejects.toMatchObject({ code: "A0500" });
  });
});

describe("workflow storage", () => {
  const valid: import("@/features/ai/schemas").WorkflowData = {
    nodes: [
      { id: "start-1", type: "start", position: { x: 0, y: 0 }, data: { label: "开始" } },
      {
        id: "w-1",
        type: "whisper",
        position: { x: 100, y: 0 },
        data: { label: "转写", prompt: "整理" },
      },
    ],
    edges: [{ id: "e1", source: "start-1", target: "w-1" }],
  };

  it("validateWorkflow 接受合法图，拒绝空节点名", () => {
    expect(validateWorkflow(valid)).toBeDefined();
    expect(validateWorkflow({ nodes: [], edges: [] })).toBeUndefined();
    expect(
      validateWorkflow({
        nodes: [{ id: "a", type: "start", position: { x: 0, y: 0 }, data: { label: "" } }],
        edges: [],
      }),
    ).toBeUndefined();
  });

  it("saveWorkflow / loadWorkflow 往返一致；非法 JSON 返回 null", () => {
    saveWorkflow(valid);
    expect(loadWorkflow()).toEqual(valid);
    window.localStorage.setItem("anynote-ai-workflow", "{broken");
    expect(loadWorkflow()).toBeNull();
  });

  it("runWorkflow 在后端端点缺失时抛可读错误（对接点契约）", async () => {
    await expect(runWorkflow(valid)).rejects.toThrow("尚未接入");
    await expect(runWorkflow({ nodes: [], edges: [] })).rejects.toThrow();
  });

  it("workflowDataSchema 剥离未知字段（后端加字段不崩）", () => {
    const parsed = workflowDataSchema.parse({
      nodes: [
        { id: "s", type: "start", position: { x: 1, y: 2 }, data: { label: "开始", extra: 1 } },
      ],
      edges: [],
    });
    expect(parsed.nodes[0]?.data).toEqual({ label: "开始" });
  });
});
