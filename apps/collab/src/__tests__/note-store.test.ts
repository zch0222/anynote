import { describe, expect, it, vi } from "vitest";
import {
  NoteNotFoundError,
  NoteStoreError,
  createNoteStore,
  internalHeaders,
} from "../note-store.ts";

const SECRET = "internal-secret-0123456789";

function envelope(code: string, data: unknown = null, msg = "") {
  return new Response(JSON.stringify({ code, msg, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function storeWith(response: Response | (() => Promise<Response>)) {
  const fetchMock = vi.fn(async () => (typeof response === "function" ? response() : response));
  const store = createNoteStore({
    baseUrl: "http://note:18091/",
    secret: SECRET,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { store, fetchMock };
}

describe("internalHeaders", () => {
  /** 与 Java `HmacUtilsTest.signMatchesCrossLanguageVector` 共用同一组测试向量。 */
  it("签名与 Java HmacUtils 的测试向量一致", () => {
    expect(internalHeaders("anynote-shared-test-vector-secret", 1790265600000)).toEqual({
      "from-source": "inner",
      "X-Internal-Timestamp": "1790265600000",
      "X-Internal-Sign": "XJ2VScsXMnbKvXkZmlWkkgIRHO6sxRvuh6WcNmwUpCM=",
    });
  });
});

describe("createNoteStore.load", () => {
  it("带签名头请求快照，并把 Base64 状态解码成字节", async () => {
    const state = new Uint8Array([1, 2, 3]);
    const { store, fetchMock } = storeWith(
      envelope("00000", {
        title: "周会纪要",
        content: "# 周会纪要",
        version: "1790265600000",
        state: Buffer.from(state).toString("base64"),
        stateVersion: "1790265590000",
        epoch: "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
      }),
    );

    const snapshot = await store.load(2571);

    expect(snapshot).toEqual({
      title: "周会纪要",
      content: "# 周会纪要",
      version: "1790265600000",
      state,
      stateVersion: "1790265590000",
      epoch: "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://note:18091/notes/2571/collab-snapshot");
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers["from-source"]).toBe("inner");
    expect(headers["X-Internal-Sign"]).toBe(
      internalHeaders(SECRET, Number(headers["X-Internal-Timestamp"]))["X-Internal-Sign"],
    );
  });

  it("没有 Y 状态时三项都为 null", async () => {
    const { store } = storeWith(envelope("00000", { title: "t", content: "c", version: "1000" }));
    expect(await store.load(1)).toMatchObject({ state: null, stateVersion: null, epoch: null });
  });

  it("A0404 抛 NoteNotFoundError", async () => {
    const { store } = storeWith(envelope("A0404", null, "笔记不存在"));
    await expect(store.load(1)).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  it("其他业务错误、响应格式异常与网络错误都抛 NoteStoreError", async () => {
    await expect(
      storeWith(envelope("B0001", null, "未知错误")).store.load(1),
    ).rejects.toMatchObject({
      name: "NoteStoreError",
      code: "B0001",
    });
    await expect(
      storeWith(new Response("<html>502</html>", { status: 502 })).store.load(1),
    ).rejects.toBeInstanceOf(NoteStoreError);
    await expect(
      storeWith(async () => {
        throw new TypeError("fetch failed");
      }).store.load(1),
    ).rejects.toBeInstanceOf(NoteStoreError);
  });
});

describe("createNoteStore.store", () => {
  const input = {
    title: "周会纪要",
    content: "# 周会纪要\n\n正文",
    state: new Uint8Array([9, 8, 7]),
    epoch: "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f",
    baseVersion: "1790265600000",
    operatorId: 10086,
  };

  it("以 PUT 发送 Base64 状态与基准版本号，成功时返回新版本号", async () => {
    const { store, fetchMock } = storeWith(envelope("00000", { version: "1790265601000" }));

    expect(await store.store(2571, input)).toEqual({ ok: true, version: "1790265601000" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({
      title: "周会纪要",
      content: "# 周会纪要\n\n正文",
      state: Buffer.from([9, 8, 7]).toString("base64"),
      epoch: input.epoch,
      baseVersion: "1790265600000",
      operatorId: 10086,
    });
  });

  it("A0409 返回冲突而不是抛错", async () => {
    const { store } = storeWith(envelope("A0409"));
    expect(await store.store(1, input)).toEqual({ ok: false, reason: "conflict" });
  });

  it("A0404 抛 NoteNotFoundError，其他失败抛 NoteStoreError", async () => {
    await expect(storeWith(envelope("A0404")).store.store(1, input)).rejects.toBeInstanceOf(
      NoteNotFoundError,
    );
    await expect(storeWith(envelope("A0160")).store.store(1, input)).rejects.toBeInstanceOf(
      NoteStoreError,
    );
  });
});
