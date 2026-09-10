// @vitest-environment jsdom
import { ApiError } from "@/lib/api/errors";
import { renderHookWithProviders } from "@/test/render";
import { waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMe } from "../use-me";

const fetchMock = vi.fn();
const profile = {
  id: 7,
  username: "tester01",
  nickname: "测试用户",
  avatar: null,
  role: { roleKey: "MEMBER", roleName: "member" },
};

function envelope(data: unknown, code = "00000", status = 200, traceId?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (traceId) headers["x-trace-id"] = traceId;
  return new Response(JSON.stringify({ code, msg: "操作成功", data }), { status, headers });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("useMe", () => {
  it("成功返回白名单资料并携带 Cookie", async () => {
    fetchMock.mockResolvedValue(envelope(profile));
    const { result } = renderHookWithProviders(() => useMe());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(profile);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/me", {
      credentials: "same-origin",
      signal: expect.any(AbortSignal),
    });
  });

  it("会话失效抛出携带状态与错误码的 ApiError", async () => {
    fetchMock.mockResolvedValue(envelope(null, "A0311", 401, "trace-1"));
    const { result } = renderHookWithProviders(() => useMe());

    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "A0311", traceId: "trace-1" });
  });

  it("响应不是合法信封时按格式异常处理", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    const { result } = renderHookWithProviders(() => useMe());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "B0500", status: 502 });
  });

  it("data 形状不符合资料 schema 时按数据异常处理", async () => {
    fetchMock.mockResolvedValue(envelope({ nickname: 123 }));
    const { result } = renderHookWithProviders(() => useMe());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "B0500" });
  });
});
