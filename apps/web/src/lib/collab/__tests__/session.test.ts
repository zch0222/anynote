import { ApiError } from "@/lib/api/errors";
import { type CollabToken, fetchCollabToken, openCollabRoom } from "@/lib/collab/session";
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebsocketProvider } from "y-websocket";
import type * as Y from "yjs";

function envelope(data: unknown, code = "00000", status = 200) {
  return new Response(JSON.stringify({ code, msg: "操作成功", data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const tokenPayload: CollabToken = {
  token: "jwt-1",
  expiresIn: 300,
  user: { id: "7", name: "小明", color: "#2563eb" },
};

describe("fetchCollabToken", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POST 到 BFF 并拆掉 ResData 信封", async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope(tokenPayload));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCollabToken()).resolves.toEqual(tokenPayload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/collab-token",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });

  it("业务错误码抛 ApiError（调用方据此展示连接失败）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(envelope(null, "A0311", 401)));
    await expect(fetchCollabToken()).rejects.toBeInstanceOf(ApiError);
  });

  it("响应结构不符合契约时抛 ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(envelope({ token: "" })));
    await expect(fetchCollabToken()).rejects.toBeInstanceOf(ApiError);
  });
});

type FakeProvider = {
  params: Record<string, string>;
  awareness: { setLocalStateField: ReturnType<typeof vi.fn> };
  destroy: ReturnType<typeof vi.fn>;
};

function createFakeProvider(): FakeProvider {
  return {
    params: {},
    awareness: { setLocalStateField: vi.fn() },
    destroy: vi.fn(),
  };
}

describe("openCollabRoom", () => {
  let provider: FakeProvider;
  let created: { serverUrl: string; room: string; params: Record<string, string> } | null;
  let fetchToken: Mock<(signal?: AbortSignal) => Promise<CollabToken>>;

  const createProvider = (
    serverUrl: string,
    room: string,
    _doc: Y.Doc,
    params: Record<string, string>,
  ) => {
    created = { serverUrl, room, params };
    provider.params = params;
    return provider as unknown as WebsocketProvider;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    provider = createFakeProvider();
    created = null;
    fetchToken = vi.fn().mockResolvedValue(tokenPayload);
  });
  afterEach(() => vi.useRealTimers());

  it("先换令牌再建连接，令牌走查询参数（浏览器 WebSocket 不能自定义请求头）", async () => {
    const session = await openCollabRoom("doc:abcdefgh", { fetchToken, createProvider });

    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(created?.room).toBe("doc:abcdefgh");
    expect(created?.params).toEqual({ token: "jwt-1" });
    expect(session.user).toEqual(tokenPayload.user);
    session.destroy();
  });

  it("把本人姓名与配色写进 awareness，别人才看得到光标标签", async () => {
    const session = await openCollabRoom("index", { fetchToken, createProvider });

    expect(provider.awareness.setLocalStateField).toHaveBeenCalledWith("user", {
      name: "小明",
      color: "#2563eb",
    });
    session.destroy();
  });

  it("到期前自动续期，并把新令牌写回 provider.params（重连时才不会 401）", async () => {
    fetchToken
      .mockResolvedValueOnce(tokenPayload)
      .mockResolvedValueOnce({ ...tokenPayload, token: "jwt-2" });
    const session = await openCollabRoom("index", { fetchToken, createProvider });

    // 300s 有效期 - 60s 提前量 = 240s 后续期
    await vi.advanceTimersByTimeAsync(239_000);
    expect(provider.params.token).toBe("jwt-1");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(provider.params.token).toBe("jwt-2");
    session.destroy();
  });

  it("续期失败不影响当前连接，稍后重试", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchToken
      .mockResolvedValueOnce(tokenPayload)
      .mockRejectedValueOnce(new Error("网络异常"))
      .mockResolvedValueOnce({ ...tokenPayload, token: "jwt-3" });
    const session = await openCollabRoom("index", { fetchToken, createProvider });

    await vi.advanceTimersByTimeAsync(240_000);
    expect(provider.params.token).toBe("jwt-1");
    expect(provider.destroy).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(provider.params.token).toBe("jwt-3");
    session.destroy();
  });

  it("有效期异常短时也不会退化成忙循环（最少 10 秒一续）", async () => {
    fetchToken.mockResolvedValue({ ...tokenPayload, expiresIn: 1 });
    const session = await openCollabRoom("index", { fetchToken, createProvider });

    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    session.destroy();
  });

  it("destroy 会拆连接并停掉续期定时器", async () => {
    const session = await openCollabRoom("index", { fetchToken, createProvider });
    session.destroy();

    expect(provider.destroy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it("换令牌就失败时直接抛出，不会建立连接", async () => {
    fetchToken.mockRejectedValue(new ApiError(401, "A0311", "登录状态已过期"));
    await expect(openCollabRoom("index", { fetchToken, createProvider })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(created).toBeNull();
  });
});
