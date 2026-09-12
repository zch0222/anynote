import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialStore } from "../auth/store";
import { createApiClients, createAuthFetch } from "../core/api";
import { envelope, makeStubFetch } from "./helpers";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-api-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function makeStore(
  refreshTokens = vi.fn(async () => ({ accessToken: "at2", refreshToken: "rt2" })),
) {
  const store = new CredentialStore({
    configDir: dir,
    profile: "default",
    now: () => 1_700_000_000_000,
    refreshTokens,
    lockOptions: { timeoutMs: 200, pollMs: 1 },
  });
  await store.saveProfile({
    apiUrl: "http://gateway.test",
    accessToken: "at1",
    refreshToken: "rt1",
    obtainedAt: 1_700_000_000_000,
  });
  return { store, refreshTokens };
}

describe("Gateway 域前缀", () => {
  it("各域拼到 /api/<domain>，ai 用 aiNio 而不是已下线的 ai", async () => {
    const { store } = await makeStore();
    const stub = makeStubFetch([
      { method: "GET", match: "/api/note/bases/1", body: envelope({ id: 1 }) },
      { method: "GET", match: "/api/system/user/mine", body: envelope({ id: 9 }) },
      { method: "GET", match: "/api/aiNio/chat/conversations/list", body: envelope([]) },
    ]);
    const api = createApiClients("http://gateway.test/", createAuthFetch(store, stub.fetch));

    await api.note.GET("/bases/{id}", { params: { path: { id: 1 } }, parseAs: "stream" });
    await api.system.GET("/user/mine", { parseAs: "stream" });
    await api.ai.GET("/chat/conversations/list", {
      params: { query: { chatConversationListDTO: { page: 1, pageSize: 20 } } },
      parseAs: "stream",
    });

    expect(stub.calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/api/note/bases/1",
      "/api/system/user/mine",
      "/api/aiNio/chat/conversations/list",
    ]);
  });

  it("baseUrl 末尾多余斜杠不会产生双斜杠", async () => {
    const { store } = await makeStore();
    const stub = makeStubFetch([{ method: "GET", match: "/bases", body: envelope({ rows: [] }) }]);
    const api = createApiClients("http://gateway.test///", createAuthFetch(store, stub.fetch));
    await api.note.GET("/bases", {
      params: { query: { page: 1, pageSize: 20, permissions: 4 } },
      parseAs: "stream",
    });
    expect(stub.calls[0]?.url).not.toContain("//api");
  });
});

describe("请求头", () => {
  it("注入 Bearer 且**保留** openapi-fetch 设置的 Content-Type", async () => {
    // 回归护栏：曾经用 fetch(request, { headers }) 追加请求头，
    // 按 fetch 规范第二参数会整体替换请求头，Content-Type 被抹掉，
    // 后端直接报 "Content-Type 'application/octet-stream' is not supported"。
    const { store } = await makeStore();
    const stub = makeStubFetch([
      { method: "POST", match: "/api/note/bases", body: envelope({ id: 1 }) },
    ]);
    const api = createApiClients("http://gateway.test", createAuthFetch(store, stub.fetch));

    await api.note.POST("/bases", {
      body: { name: "库", detail: "", cover: "https://example.com/c.png", type: 0 },
      parseAs: "stream",
    });

    expect(stub.calls[0]?.authorization).toBe("Bearer at1");
    expect(stub.calls[0]?.contentType).toBe("application/json");
    expect(JSON.parse(stub.calls[0]?.body ?? "{}")).toMatchObject({ name: "库" });
  });
});

describe("query 序列化", () => {
  it("springdoc 包装对象被展平成平铺参数", async () => {
    const { store } = await makeStore();
    const stub = makeStubFetch([
      { method: "GET", match: "/notes/search", body: envelope({ rows: [] }) },
    ]);
    const api = createApiClients("http://gateway.test", createAuthFetch(store, stub.fetch));

    await api.note.GET("/notes/search", {
      params: { query: { noteSearchDTO: { keyword: "笔记", page: 1, pageSize: 20 } } },
      parseAs: "stream",
    });

    const url = new URL(stub.calls[0]?.url ?? "");
    expect(url.searchParams.get("keyword")).toBe("笔记");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.has("noteSearchDTO")).toBe(false);
  });
});

describe("401 刷新与重放", () => {
  it("401 后刷新一次并用新 token 重放同一请求体", async () => {
    const { store, refreshTokens } = await makeStore();
    const stub = makeStubFetch([
      {
        method: "PATCH",
        match: "/notes/1",
        bodies: [{ code: "A0301", msg: "未授权" }, envelope({ id: 1 })],
        status: 200,
      },
    ]);
    // 第一次返回 401：用状态码区分，单独造一个路由
    const calls: Array<{ token: string | null; body: string | null }> = [];
    let first = true;
    const fetchImpl: typeof fetch = async (input) => {
      const request = input as Request;
      const body = await request.clone().text();
      calls.push({ token: request.headers.get("authorization"), body });
      if (first) {
        first = false;
        return new Response(JSON.stringify({ code: "A0301", msg: "未授权" }), { status: 401 });
      }
      return new Response(JSON.stringify(envelope({ id: 1, version: "2" })), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const api = createApiClients("http://gateway.test", createAuthFetch(store, fetchImpl));
    const { response } = await api.note.PATCH("/notes/{noteId}", {
      params: { path: { noteId: 1 } },
      body: { content: "正文", version: "1" },
      parseAs: "stream",
    });

    expect(response.status).toBe(200);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.token).toBe("Bearer at1");
    expect(calls[1]?.token).toBe("Bearer at2");
    // 重放必须带上同一份请求体
    expect(calls[1]?.body).toBe(calls[0]?.body);
    expect(stub.calls).toHaveLength(0);
  });

  it("刷新失败时不再重放，把 401 原样交给上层", async () => {
    const refreshTokens = vi.fn(async () => {
      throw new Error("refresh 失败");
    });
    const store = new CredentialStore({
      configDir: dir,
      profile: "default",
      now: () => 1_700_000_000_000,
      refreshTokens,
      lockOptions: { timeoutMs: 50, pollMs: 1 },
    });
    // 没有 refreshToken：refresh() 直接返回 null，不应该再发第二次请求
    await store.saveProfile({
      apiUrl: "http://gateway.test",
      accessToken: "at1",
      refreshToken: "",
      obtainedAt: 0,
    });

    let count = 0;
    const fetchImpl: typeof fetch = async () => {
      count += 1;
      return new Response(JSON.stringify({ code: "A0301", msg: "未授权" }), { status: 401 });
    };
    const api = createApiClients("http://gateway.test", createAuthFetch(store, fetchImpl));
    const { response } = await api.note.GET("/bases/{id}", {
      params: { path: { id: 1 } },
      parseAs: "stream",
    });

    expect(response.status).toBe(401);
    expect(count).toBe(1);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("非 401 的失败不会触发刷新", async () => {
    const { store, refreshTokens } = await makeStore();
    const stub = makeStubFetch([
      { method: "GET", match: "/bases/1", body: { code: "B0001", msg: "业务失败" } },
    ]);
    const api = createApiClients("http://gateway.test", createAuthFetch(store, stub.fetch));
    await api.note.GET("/bases/{id}", { params: { path: { id: 1 } }, parseAs: "stream" });
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(stub.calls).toHaveLength(1);
  });
});
