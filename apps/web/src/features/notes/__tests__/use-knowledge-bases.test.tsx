import { noteQueryKeys } from "@/features/notes/query-keys";
import { ALL_BASE_PERMISSIONS, DEFAULT_BASE_COVER } from "@/features/notes/schemas";
import { noteApi } from "@/lib/api/openapi";
import { renderHookWithProviders } from "@/test/render";
import { act, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateKnowledgeBaseMutation,
  useKnowledgeBaseMembersQuery,
  useKnowledgeBaseQuery,
  useKnowledgeBasesQuery,
  useRemoveMemberMutation,
} from "../use-knowledge-bases";

vi.mock("@/lib/api/openapi", () => ({
  noteApi: { PATCH: vi.fn(), GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() },
}));

const get = noteApi.GET as unknown as Mock;
const post = noteApi.POST as unknown as Mock;
const remove = noteApi.DELETE as unknown as Mock;

function envelope(data: unknown, code = "00000") {
  return {
    response: new Response(JSON.stringify({ code, msg: "操作成功", data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  remove.mockReset();
});

describe("useKnowledgeBasesQuery", () => {
  it("以最大权限值请求全部知识库并返回 rows", async () => {
    get.mockResolvedValue(envelope({ rows: [{ id: 1, knowledgeBaseName: "默认库" }, { id: 2 }] }));
    const { result } = renderHookWithProviders(() => useKnowledgeBasesQuery());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledExactlyOnceWith("/bases", {
      params: { query: { page: 1, pageSize: 20, permissions: ALL_BASE_PERMISSIONS } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toEqual([{ id: 1, knowledgeBaseName: "默认库" }, { id: 2 }]);
  });

  it("rows 缺省时兜底为空数组", async () => {
    get.mockResolvedValue(envelope({ rows: null }));
    const { result } = renderHookWithProviders(() => useKnowledgeBasesQuery());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useKnowledgeBaseQuery", () => {
  it("请求知识库详情", async () => {
    get.mockResolvedValue(envelope({ id: 7, knowledgeBaseName: "工作库" }));
    const { result } = renderHookWithProviders(() => useKnowledgeBaseQuery(7));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledExactlyOnceWith("/bases/{id}", {
      params: { path: { id: 7 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(result.current.data).toMatchObject({ id: 7, knowledgeBaseName: "工作库" });
  });

  it("非法 id 不发请求", async () => {
    renderHookWithProviders(() => useKnowledgeBaseQuery(0));
    await act(async () => {});
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useCreateKnowledgeBaseMutation", () => {
  it("创建时补默认封面与类型，成功返回新库 id 并失效知识库缓存", async () => {
    post.mockResolvedValue(envelope({ id: 33, knowledgeBaseName: "新库" }));
    const { result, queryClient } = renderHookWithProviders(() => useCreateKnowledgeBaseMutation());
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ name: "新库", detail: "简介" });
    });

    expect(post).toHaveBeenCalledExactlyOnceWith("/bases", {
      body: { name: "新库", detail: "简介", cover: DEFAULT_BASE_COVER, type: 0 },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: noteQueryKeys.bases });
  });

  it("业务失败不重试，直接进入错误态", async () => {
    post.mockResolvedValue(envelope(null, "A0402"));
    const { result } = renderHookWithProviders(() => useCreateKnowledgeBaseMutation());

    await act(async () => {
      await result.current.mutateAsync({ name: "冲突的库名", detail: "" }).catch(() => undefined);
    });

    expect(post).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useKnowledgeBaseMembersQuery", () => {
  it("username 进 query 参数，默认空串（不按用户名过滤）", async () => {
    get.mockResolvedValue(envelope({ rows: [{ userId: 2, nickname: "周宁", permissions: 3 }] }));
    const { result } = renderHookWithProviders(() => useKnowledgeBaseMembersQuery(7));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledExactlyOnceWith("/bases/users", {
      params: { query: { knowledgeBaseId: 7, page: 1, pageSize: 20, username: "" } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
  });

  it("搜索关键词同时进参数与 query key，切换关键词是另一次请求", async () => {
    get.mockResolvedValue(envelope({ rows: [] }));
    const { queryClient } = renderHookWithProviders(() =>
      useKnowledgeBaseMembersQuery(7, { username: "zhou" }),
    );

    await waitFor(() =>
      expect(queryClient.getQueryData(noteQueryKeys.baseMembers(7, "zhou"))).toBeDefined(),
    );
    expect(get).toHaveBeenCalledWith(
      "/bases/users",
      expect.objectContaining({
        params: { query: { knowledgeBaseId: 7, page: 1, pageSize: 20, username: "zhou" } },
      }),
    );
    // 不同关键词是不同缓存条目（否则切词只看到上一个结果）
    expect(queryClient.getQueryData(noteQueryKeys.baseMembers(7, ""))).toBeUndefined();
  });
});

describe("useRemoveMemberMutation", () => {
  it("按 userId + knowledgeBaseId 请求 DELETE，并失效整棵成员子树", async () => {
    remove.mockResolvedValue(envelope(null));
    const { result, queryClient } = renderHookWithProviders(() => useRemoveMemberMutation());
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ userId: 2, knowledgeBaseId: 7 });
    });

    expect(remove).toHaveBeenCalledExactlyOnceWith("/bases/users", {
      params: { query: { userId: 2, knowledgeBaseId: 7 } },
      parseAs: "stream",
      signal: expect.any(AbortSignal),
    });
    // 一个人可能出现在多个搜索关键词的结果里，所以按整棵子树失效
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: noteQueryKeys.baseMembersRoot });
  });

  it("后端禁止移除自己时进入错误态且不重试", async () => {
    remove.mockResolvedValue(envelope(null, "B0001"));
    const { result } = renderHookWithProviders(() => useRemoveMemberMutation());

    await act(async () => {
      await result.current.mutateAsync({ userId: 1, knowledgeBaseId: 7 }).catch(() => undefined);
    });

    expect(remove).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
