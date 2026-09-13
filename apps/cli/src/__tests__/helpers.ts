import { CredentialStore } from "../auth/store";
import { createAnonymousAuthClient, createApiClients, createAuthFetch } from "../core/api";
import type { RegisteredCommand } from "../core/command";
import type { CliContext } from "../core/context";
import type { CliIo, OutputMode } from "../core/output";
import { SettingsStore } from "../core/settings";

export type RecordedCall = {
  method: string;
  url: string;
  contentType: string | null;
  authorization: string | null;
  body: string | null;
};

export type StubRoute = {
  /** 命中规则：方法 + url 子串 */
  method: string;
  match: string;
  status?: number;
  /** ResData 信封，或直接给字符串 */
  body?: unknown;
  /** 多次命中时按顺序返回；用完后重复最后一个 */
  bodies?: unknown[];
};

export function makeIo(isTTY = false) {
  const state = { stdout: "", stderr: "" };
  const io: CliIo = {
    out: (chunk) => {
      state.stdout += chunk;
    },
    err: (chunk) => {
      state.stderr += chunk;
    },
    isTTY,
  };
  return { io, state };
}

/**
 * 打桩到注入的 fetch，而不是全局 fetch：这样 openapi-fetch 的 URL 拼装、
 * query 序列化、请求头都会被真实执行到，能测出契约层面的问题。
 */
export function makeStubFetch(routes: StubRoute[]) {
  const calls: RecordedCall[] = [];
  const hits = new Map<StubRoute, number>();
  const fetchImpl: typeof fetch = async (input) => {
    const request = input as Request;
    const url = request.url;
    const method = request.method;
    const body = await request.clone().text();
    calls.push({
      method,
      url,
      contentType: request.headers.get("content-type"),
      authorization: request.headers.get("authorization"),
      body: body || null,
    });
    const route = routes.find(
      (candidate) => candidate.method === method && url.includes(candidate.match),
    );
    if (!route) {
      return new Response(JSON.stringify({ code: "B0404", msg: `无桩路由 ${method} ${url}` }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const index = hits.get(route) ?? 0;
    hits.set(route, index + 1);
    const payload = route.bodies
      ? (route.bodies[Math.min(index, route.bodies.length - 1)] ?? null)
      : (route.body ?? { code: "00000", msg: "操作成功", data: null });
    return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fetchImpl, calls };
}

export type TestContextOptions = {
  routes?: StubRoute[];
  configDir: string;
  isTTY?: boolean;
  mode?: OutputMode;
  yes?: boolean;
  commands?: RegisteredCommand[];
  envToken?: string;
  now?: () => number;
};

export function makeContext(options: TestContextOptions) {
  const { io, state } = makeIo(options.isTTY ?? false);
  const stub = makeStubFetch(options.routes ?? []);
  const now = options.now ?? (() => 1_700_000_000_000);
  const credentials = new CredentialStore({
    configDir: options.configDir,
    profile: "default",
    ...(options.envToken ? { envToken: options.envToken } : {}),
    now,
    refreshTokens: async () => ({ accessToken: "refreshed", refreshToken: "rt2" }),
  });
  const apiUrl = "http://gateway.test";
  const ctx: CliContext = {
    commands: options.commands ?? [],
    api: createApiClients(apiUrl, createAuthFetch(credentials, stub.fetch)),
    authApi: createAnonymousAuthClient(apiUrl, stub.fetch),
    credentials,
    settings: new SettingsStore(options.configDir),
    env: {
      apiUrl,
      apiUrlSource: "env",
      token: options.envToken,
      profile: "default",
      configDir: options.configDir,
      forceJson: false,
    },
    io,
    now,
    mode: options.mode ?? "json",
    yes: options.yes ?? true,
    dryRun: false,
    version: "0.0.0-test",
  };
  return { ctx, io: state, calls: stub.calls };
}

export function envelope(data: unknown) {
  return { code: "00000", msg: "操作成功", data };
}

export function failure(code: string, msg: string) {
  return { code, msg, data: {} };
}
