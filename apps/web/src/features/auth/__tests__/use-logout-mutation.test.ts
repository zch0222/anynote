import { emptySurface, useSidePanelStore } from "@/features/side-panel/store";
import { renderHookWithProviders } from "@/test/render";
import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogoutMutation } from "../use-logout-mutation";

const { post, replace, refresh } = vi.hoisted(() => ({
  post: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("openapi-fetch", () => ({ default: () => ({ POST: post }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
const clearAllLocalNotes = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/collab/local-persistence", () => ({ clearAllLocalNotes }));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("useLogoutMutation", () => {
  it("请求不含凭据，成功后清理所有查询缓存并返回登录", async () => {
    post.mockResolvedValue({ response: new Response(JSON.stringify({ code: "00000" })) });
    const { result, queryClient } = renderHookWithProviders(() => useLogoutMutation());
    queryClient.setQueryDefaults(["notes"], { gcTime: Number.POSITIVE_INFINITY });
    queryClient.setQueryData(["notes"], ["private"]);
    await act(async () => result.current.mutateAsync());
    expect(post).toHaveBeenCalledWith(
      "/logout",
      expect.objectContaining({ body: {}, signal: expect.any(AbortSignal) }),
    );
    expect(queryClient.getQueryData(["notes"])).toBeUndefined();
    expect(replace).toHaveBeenCalledExactlyOnceWith("/login");
    expect(refresh).toHaveBeenCalledOnce();
    // 笔记离线副本随退出登录一起删除
    expect(clearAllLocalNotes).toHaveBeenCalledOnce();
  });

  /** 成功后只删除右侧栏键，保留其它本地数据。 */
  it("成功后删除右侧栏本地键", async () => {
    localStorage.setItem("anynote-ai-side-panel:v1:1", "{}");
    localStorage.setItem("anynote-other", "keep");
    post.mockResolvedValue({ response: new Response(JSON.stringify({ code: "00000" })) });
    const { result } = renderHookWithProviders(() => useLogoutMutation());
    await act(async () => result.current.mutateAsync());
    expect(localStorage.getItem("anynote-ai-side-panel:v1:1")).toBeNull();
    expect(localStorage.getItem("anynote-other")).toBe("keep");
  });

  /** 登出同时清空进程内的侧栏分区，避免下一位用户看到上一位的标签。 */
  it("成功后清空侧栏内存状态", async () => {
    useSidePanelStore.setState({
      surfaces: { "chat:c1": { ...emptySurface(), open: true } },
      guards: { "chat:c1": () => true },
      newWindowHandlers: { "chat:c1": () => {} },
    });
    post.mockResolvedValue({ response: new Response(JSON.stringify({ code: "00000" })) });
    const { result } = renderHookWithProviders(() => useLogoutMutation());
    await act(async () => result.current.mutateAsync());
    const state = useSidePanelStore.getState();
    expect(state.surfaces).toEqual({});
    expect(state.guards).toEqual({});
    expect(state.newWindowHandlers).toEqual({});
  });

  it.each([new Response(JSON.stringify({ code: "B0400" })), new Response("oops", { status: 502 })])(
    "失败时保留缓存，允许重试",
    async (response) => {
      post.mockResolvedValue({ response });
      const { result, queryClient } = renderHookWithProviders(() => useLogoutMutation());
      queryClient.setQueryDefaults(["notes"], { gcTime: Number.POSITIVE_INFINITY });
      queryClient.setQueryData(["notes"], ["private"]);
      act(() => result.current.mutate());
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(queryClient.getQueryData(["notes"])).toEqual(["private"]);
      expect(replace).not.toHaveBeenCalled();
      expect(post).toHaveBeenCalledOnce();
      expect(clearAllLocalNotes).not.toHaveBeenCalled();
    },
  );
});
