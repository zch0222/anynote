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
beforeEach(() => vi.clearAllMocks());

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
    },
  );
});
