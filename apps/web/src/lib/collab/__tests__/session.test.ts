import { ApiError } from "@/lib/api/errors";
import type { LocalNoteStore } from "@/lib/collab/local-persistence";
import {
  ANYNOTE_ACK,
  ANYNOTE_HELLO,
  ANYNOTE_STORED,
  CLOSE_EDITOR_VERSION,
  CLOSE_EPOCH_MISMATCH,
  CLOSE_NOT_FOUND,
  type CollabToken,
  type CollabTokenRequest,
  MESSAGE_ANYNOTE,
  computeLineage,
  fetchCollabToken,
  openCollabRoom,
  parseServerEditorVersion,
} from "@/lib/collab/session";
import { UNACKED_GRACE_MS } from "@/lib/collab/sync-state";
import { EDITOR_SCHEMA_VERSION } from "@anynote/editor-core/version";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
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

    await expect(fetchCollabToken({ noteId: 42 })).resolves.toEqual(tokenPayload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/collab-token",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ noteId: 42 }),
      }),
    );
  });

  it("请求体带 noteId：令牌绑定的是具体笔记，不是整站", async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope(tokenPayload));
    vi.stubGlobal("fetch", fetchMock);

    await fetchCollabToken({ noteId: 7 });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(body).toEqual({ noteId: 7 });
  });

  it("业务错误码抛 ApiError（调用方据此展示连接失败）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(envelope(null, "A0311", 401)));
    await expect(fetchCollabToken({ noteId: 42 })).rejects.toBeInstanceOf(ApiError);
  });

  it("响应结构不符合契约时抛 ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(envelope({ token: "" })));
    await expect(fetchCollabToken({ noteId: 42 })).rejects.toBeInstanceOf(ApiError);
  });
});

type Handler = (payload: never) => void;

type FakeProvider = {
  params: Record<string, string>;
  wsconnected: boolean;
  messageHandlers: Array<(encoder: encoding.Encoder, decoder: decoding.Decoder) => void>;
  awareness: { setLocalStateField: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  on: (event: string, handler: Handler) => void;
  emit: (event: string, payload: unknown) => void;
  receive: (subType: number, payload?: Record<string, unknown>) => void;
};

function createFakeProvider(): FakeProvider {
  const handlers = new Map<string, Handler[]>();
  const provider: FakeProvider = {
    params: {},
    wsconnected: true,
    messageHandlers: [],
    awareness: { setLocalStateField: vi.fn() },
    connect: vi.fn(),
    destroy: vi.fn(),
    on: (event, handler) => handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    emit: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload as never);
    },
    receive: (subType, payload = {}) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_ANYNOTE);
      encoding.writeVarUint(encoder, subType);
      encoding.writeVarString(encoder, JSON.stringify(payload));
      const decoder = decoding.createDecoder(encoding.toUint8Array(encoder));
      decoding.readVarUint(decoder);
      provider.messageHandlers[MESSAGE_ANYNOTE]?.(encoding.createEncoder(), decoder);
    },
  };
  return provider;
}

/** 假本地库：记录载入、谱系与清理，内容放在内存里。 */
function createFakeLocal(options: { content?: string; epoch?: string | null } = {}) {
  const stores: Array<LocalNoteStore & { cleared: boolean; epochValue: string | null }> = [];
  const api = {
    exists: options.content !== undefined,
    has: vi.fn(() => api.exists),
    open: vi.fn(async (_noteId: number, doc: Y.Doc) => {
      const origin = {};
      const store = {
        origin,
        available: true,
        cleared: false,
        epochValue: options.epoch ?? null,
        load: vi.fn(async () => {
          if (!options.content) return false;
          doc.transact(() => doc.getText("t").insert(0, options.content ?? ""), origin);
          return true;
        }),
        getEpoch: vi.fn(async () => store.epochValue),
        setEpoch: vi.fn(async (epoch: string) => {
          store.epochValue = epoch;
        }),
        onDisabled: () => () => {},
        clear: vi.fn(async () => {
          store.cleared = true;
        }),
        destroy: vi.fn(),
      };
      stores.push(store);
      return store;
    }),
  };
  return { api, stores };
}

const EPOCH = "7d4f0c9e-1b2a-4c3d-8e9f-0a1b2c3d4e5f";

describe("openCollabRoom", () => {
  let provider: FakeProvider;
  let created: { serverUrl: string; room: string; params: Record<string, string> } | null;
  let fetchToken: Mock<(request: CollabTokenRequest, signal?: AbortSignal) => Promise<CollabToken>>;
  let local: ReturnType<typeof createFakeLocal>;

  const createProvider = (
    serverUrl: string,
    room: string,
    _doc: Y.Doc,
    params: Record<string, string>,
  ) => {
    created = { serverUrl, room, params: { ...params } };
    provider.params = params;
    return provider as unknown as WebsocketProvider;
  };

  const open = () =>
    openCollabRoom("note:42", { fetchToken, createProvider, localStore: local.api });

  beforeEach(() => {
    vi.useFakeTimers();
    provider = createFakeProvider();
    created = null;
    fetchToken = vi.fn().mockResolvedValue(tokenPayload);
    local = createFakeLocal();
  });
  afterEach(() => vi.useRealTimers());

  it("先换令牌再建连接；令牌、编辑器版本与谱系走查询参数", async () => {
    const session = await open();

    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(fetchToken).toHaveBeenCalledWith({ noteId: 42 }, undefined);
    expect(created?.room).toBe("note:42");
    expect(created?.params).toEqual({
      token: "jwt-1",
      editorVersion: String(EDITOR_SCHEMA_VERSION),
      lineage: "fresh",
    });
    expect(provider.connect).toHaveBeenCalledOnce();
    expect(session.user).toEqual(tokenPayload.user);
    session.destroy();
  });

  it("把本人姓名与配色写进 awareness，别人才看得到光标标签", async () => {
    const session = await open();

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
    const session = await open();

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
    const session = await open();

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
    const session = await open();

    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    session.destroy();
  });

  it("destroy 会拆连接并停掉续期定时器", async () => {
    const session = await open();
    session.destroy();

    expect(provider.destroy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it("换令牌就失败时直接抛出，不会建立连接", async () => {
    fetchToken.mockRejectedValue(new ApiError(401, "A0311", "登录状态已过期"));
    await expect(open()).rejects.toBeInstanceOf(ApiError);
    expect(created).toBeNull();
  });

  it("非法房间名在换令牌之前就被拒（不会把无效房间带进协同服务）", async () => {
    await expect(
      openCollabRoom("index", { fetchToken, createProvider, localStore: local.api }),
    ).rejects.toThrow(/非法协同房间名/);
    expect(fetchToken).not.toHaveBeenCalled();
    expect(created).toBeNull();
  });

  describe("服务端落库：hello、确认与本地副本", () => {
    it("本地有同谱系副本时先载入，握手带 epoch，连上之前即可编辑", async () => {
      local = createFakeLocal({ content: "离线写的字", epoch: EPOCH });
      const session = await open();

      expect(created?.params.lineage).toBe(`epoch:${EPOCH}`);
      expect(session.doc.getText("t").toString()).toBe("离线写的字");
      expect(session.getState()).toMatchObject({
        localReady: true,
        serverPersist: true,
        epoch: EPOCH,
        hasLocalPersistence: true,
      });
      session.destroy();
    });

    it("本地副本没有记录谱系时握手带 unknown，不放开离线编辑", async () => {
      local = createFakeLocal({ content: "来历不明", epoch: null });
      const session = await open();

      expect(created?.params.lineage).toBe("unknown");
      expect(session.getState().localReady).toBe(false);
      session.destroy();
    });

    it("收到 hello 后记下谱系、启用本地副本并写入谱系", async () => {
      const session = await open();
      expect(local.api.open).not.toHaveBeenCalled();

      provider.receive(ANYNOTE_HELLO, { serverPersist: true, epoch: EPOCH, editorVersion: 1 });
      await vi.advanceTimersByTimeAsync(0);

      expect(session.getState()).toMatchObject({ serverPersist: true, epoch: EPOCH });
      expect(local.stores[0]?.setEpoch).toHaveBeenCalledWith(EPOCH);
      expect(provider.params.lineage).toBe(`epoch:${EPOCH}`);
      session.destroy();
    });

    it("本地编辑计入待确认，确认到达后清零；服务端下发的更新不计入", async () => {
      const session = await open();
      provider.receive(ANYNOTE_HELLO, { serverPersist: true, epoch: EPOCH, editorVersion: 1 });

      session.doc.getText("t").insert(0, "本地");
      expect(session.getState().sync.pending).toBe(1);

      session.doc.transact(() => session.doc.getText("t").insert(0, "远端"), provider);
      expect(session.getState().sync.pending).toBe(1);

      provider.receive(ANYNOTE_ACK);
      expect(session.getState().sync.pending).toBe(0);
      session.destroy();
    });

    it("确认迟迟不到时报告同步中", async () => {
      const session = await open();
      provider.receive(ANYNOTE_HELLO, { serverPersist: true, epoch: EPOCH, editorVersion: 1 });
      const states: boolean[] = [];
      session.subscribe((state) => states.push(state.sync.unsynced));

      session.doc.getText("t").insert(0, "本地");
      await vi.advanceTimersByTimeAsync(UNACKED_GRACE_MS + 10);

      expect(session.getState().sync.unsynced).toBe(true);
      expect(states).toContain(true);
      session.destroy();
    });

    it("落库通知：记下版本号与标题并通知订阅者，每条通知都是新对象", async () => {
      const session = await open();
      provider.receive(ANYNOTE_HELLO, { serverPersist: true, epoch: EPOCH, editorVersion: 1 });
      expect(session.getState().stored).toBeNull();
      const notices: unknown[] = [];
      session.subscribe((state) => notices.push(state.stored));

      provider.receive(ANYNOTE_STORED, { version: "1790265601000", title: "新标题" });
      const first = session.getState().stored;
      provider.receive(ANYNOTE_STORED, { version: "1790265602000", title: "新标题" });

      expect(first).toEqual({ version: "1790265601000", title: "新标题" });
      expect(session.getState().stored).toEqual({ version: "1790265602000", title: "新标题" });
      expect(session.getState().stored).not.toBe(first);
      expect(notices).toHaveLength(2);
      session.destroy();
    });

    it("落库通知缺版本号时忽略；标题不是字符串时记为 null", async () => {
      const session = await open();
      provider.receive(ANYNOTE_STORED, { title: "只有标题" });
      expect(session.getState().stored).toBeNull();

      provider.receive(ANYNOTE_STORED, { version: "1790265601000", title: 3 });
      expect(session.getState().stored).toEqual({ version: "1790265601000", title: null });
      session.destroy();
    });

    it("没有 hello（旧服务端）时不做确认计数", async () => {
      const session = await open();
      session.doc.getText("t").insert(0, "本地");
      await vi.advanceTimersByTimeAsync(UNACKED_GRACE_MS + 10);
      expect(session.getState().sync).toMatchObject({ pending: 0, unsynced: false });
      session.destroy();
    });

    it("同步完成却没收到 hello（服务端回滚）时清掉本地副本", async () => {
      local = createFakeLocal({ content: "副本", epoch: EPOCH });
      const session = await open();

      provider.emit("sync", true);

      expect(local.stores[0]?.clear).toHaveBeenCalled();
      expect(session.getState().serverPersist).toBe(false);
      session.destroy();
    });

    it("连接关闭后按当前谱系重算重连用的 lineage", async () => {
      const session = await open();
      session.doc.getText("t").insert(0, "有内容但不知道谱系");
      provider.emit("connection-close", null);
      expect(provider.params.lineage).toBe("unknown");

      provider.receive(ANYNOTE_HELLO, { serverPersist: true, epoch: EPOCH, editorVersion: 1 });
      provider.emit("connection-close", null);
      expect(provider.params.lineage).toBe(`epoch:${EPOCH}`);
      session.destroy();
    });
  });

  describe("终止连接的关闭码", () => {
    it("4426：编辑器版本不符，带出服务端版本", async () => {
      const session = await open();
      provider.emit("closed", { code: CLOSE_EDITOR_VERSION, reason: "editor-version:3" });
      expect(session.getState().fatal).toEqual({ kind: "outdated", serverVersion: 3 });
      session.destroy();
    });

    it("还没收到 hello 就被 4426 关闭时，同样按服务端落库模式展示（只有落库模式会发这个关闭码）", async () => {
      const session = await open();
      expect(session.getState().serverPersist).toBe(false);
      provider.emit("closed", { code: CLOSE_EDITOR_VERSION, reason: "editor-version:3" });
      expect(session.getState().serverPersist).toBe(true);
      session.destroy();
    });

    it("4404：笔记已删除，清掉本地副本", async () => {
      local = createFakeLocal({ content: "副本", epoch: EPOCH });
      const session = await open();
      provider.emit("closed", { code: CLOSE_NOT_FOUND, reason: "note-not-found" });
      expect(session.getState().fatal).toEqual({ kind: "deleted" });
      expect(local.stores[0]?.clear).toHaveBeenCalled();
      session.destroy();
    });

    it("4409：谱系不符，交给调用方重建；clearLocal 删除本地副本", async () => {
      local = createFakeLocal({ content: "副本", epoch: EPOCH });
      const session = await open();
      provider.emit("closed", { code: CLOSE_EPOCH_MISMATCH, reason: "epoch-mismatch" });
      expect(session.getState().fatal).toEqual({ kind: "lineage" });

      await session.clearLocal();
      expect(local.stores[0]?.clear).toHaveBeenCalled();
      session.destroy();
    });

    it("其他关闭码不算终止", async () => {
      const session = await open();
      provider.emit("closed", { code: 4001, reason: "x" });
      expect(session.getState().fatal).toBeNull();
      session.destroy();
    });
  });
});

describe("握手参数的纯函数", () => {
  it("computeLineage：已知谱系 → epoch；空文档 → fresh；否则 unknown", () => {
    expect(computeLineage(true, EPOCH)).toBe(`epoch:${EPOCH}`);
    expect(computeLineage(false, EPOCH)).toBe(`epoch:${EPOCH}`);
    expect(computeLineage(true, null)).toBe("fresh");
    expect(computeLineage(false, null)).toBe("unknown");
  });

  it("parseServerEditorVersion：从关闭原因取服务端版本", () => {
    expect(parseServerEditorVersion("editor-version:12")).toBe(12);
    expect(parseServerEditorVersion("")).toBeNull();
    expect(parseServerEditorVersion(undefined)).toBeNull();
  });
});
