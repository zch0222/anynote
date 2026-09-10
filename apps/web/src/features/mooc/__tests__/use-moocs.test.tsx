import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { GET: vi.fn(), POST: vi.fn() },
  fileApi: { GET: vi.fn() },
}));

import { moocQueryKeys } from "@/features/mooc/query-keys";
import { moocItemTypeName, objectUrlSchema } from "@/features/mooc/schemas";
import {
  useCreateMoocMutation,
  useMoocItemQuery,
  useMoocItemsQuery,
  useMoocsQuery,
  useObjectUrlQuery,
} from "@/features/mooc/use-moocs";
import { fileApi, noteApi } from "@/lib/api/openapi";

const noteApiMock = vi.mocked(noteApi, true);
const fileApiMock = vi.mocked(fileApi, true);

function envelope(data: unknown, code = "00000"): { response: Response } {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), { status: 200 }),
  };
}

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function wrapperWith(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("use-moocs", () => {
  beforeEach(() => {
    noteApiMock.GET.mockReset();
    noteApiMock.POST.mockReset();
    fileApiMock.GET.mockReset();
  });

  it("课程列表：query 走 moocListDTO，knowledgeId 无效不请求", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope({ current: 1, pages: 1, total: 1, rows: [{ id: 8, title: "高数" }] }),
    );
    const { result } = renderHook(() => useMoocsQuery(4), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/moocs",
      expect.objectContaining({
        params: { query: { moocListDTO: { knowledgeId: 4, page: 1, pageSize: 50 } } },
      }),
    );
    expect(result.current.data?.rows[0]?.title).toBe("高数");

    noteApiMock.GET.mockClear();
    renderHook(() => useMoocsQuery(0), { wrapper: wrapper() });
    expect(noteApiMock.GET).not.toHaveBeenCalled();
  });

  it("条目列表：携带 moocId + parentId", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope({ current: 1, pages: 1, total: 0, rows: [{ id: 1, moocItemType: 1, parentId: 0 }] }),
    );
    const { result } = renderHook(() => useMoocItemsQuery(8, 0), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/moocs/items",
      expect.objectContaining({
        params: { query: { moocItemListDTO: { moocId: 8, parentId: 0, page: 1, pageSize: 50 } } },
      }),
    );
  });

  it("条目详情：path moocItemId + query moocId", async () => {
    noteApiMock.GET.mockResolvedValue(
      envelope({
        id: 2,
        title: "第一课",
        moocItemType: 1,
        objectName: "v/a.mp4",
        moocItemText: null,
      }),
    );
    const { result } = renderHook(() => useMoocItemQuery(8, 2), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(noteApiMock.GET).toHaveBeenCalledWith(
      "/moocs/items/{moocItemId}",
      expect.objectContaining({ params: { path: { moocItemId: 2 }, query: { moocId: 8 } } }),
    );
  });

  it("objectName 换临时 URL（file 域 byObjectName）", async () => {
    fileApiMock.GET.mockResolvedValue(
      envelope({ url: "https://oss/a.mp4", expireTime: "2026-09-11T12:00:00" }),
    );
    const { result } = renderHook(() => useObjectUrlQuery("a.mp4"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fileApiMock.GET).toHaveBeenCalledWith(
      "/public/byObjectName",
      expect.objectContaining({ params: { query: { objectName: "a.mp4" } } }),
    );
    expect(objectUrlSchema.safeParse(result.current.data).success).toBe(true);

    fileApiMock.GET.mockClear();
    renderHook(() => useObjectUrlQuery(null), { wrapper: wrapper() });
    expect(fileApiMock.GET).not.toHaveBeenCalled();
  });

  it("新建课程：body 带默认封面，成功返回 id 并失效列表", async () => {
    noteApiMock.POST.mockResolvedValue(envelope(66));
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateMoocMutation(), {
      wrapper: wrapperWith(queryClient),
    });
    const id = await result.current.mutateAsync({ title: "新课程", knowledgeBaseId: 4 });
    expect(id).toBe(66);
    expect(noteApiMock.POST).toHaveBeenCalledWith(
      "/moocs",
      expect.objectContaining({
        body: expect.objectContaining({
          title: "新课程",
          knowledgeBaseId: 4,
          cover: expect.any(String),
        }),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: moocQueryKeys.list(4) });
  });

  it("条目类型名称映射", () => {
    expect(moocItemTypeName(0)).toBe("章节");
    expect(moocItemTypeName(1)).toBe("视频");
    expect(moocItemTypeName(2)).toBe("文档");
    expect(moocItemTypeName(null)).toBe("章节");
  });
});
