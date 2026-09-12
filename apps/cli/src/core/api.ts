import type { paths as AiPaths } from "@anynote/api-client/src/ai";
import type { paths as AuthPaths } from "@anynote/api-client/src/auth";
import type { paths as FilePaths } from "@anynote/api-client/src/file";
import type { paths as NotePaths } from "@anynote/api-client/src/note";
import type { paths as NotifyPaths } from "@anynote/api-client/src/notify";
import type { paths as SystemPaths } from "@anynote/api-client/src/system";
import { flattenedDtoQuerySerializer } from "@anynote/api-core";
import createClient from "openapi-fetch";
import type { CredentialStore, TokenPair } from "../auth/store";
import { NetworkError, isNetworkFailure } from "./exit";

/**
 * Gateway 路由前缀，与 nacos 的 anynote-gateway-dev.yml 一一对应。
 * ai 域走 `aiNio`：`/api/ai` 是 Phase 3 合并前的旧服务，已下线恒 503。
 */
export const DOMAINS = {
  auth: "auth",
  system: "system",
  note: "note",
  file: "file",
  ai: "aiNio",
  notify: "notify",
} as const;

export const REQUEST_TIMEOUT_MS = 20_000;

/** 把 Node fetch 的连接类错误统一成 NetworkError，让退出码映射有稳定输入。 */
export async function guardNetwork<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new NetworkError("无法连接 Anynote 网关，确认后端已启动且 ANYNOTE_API_URL 正确", {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * 注入 Bearer 并在 401 时刷新一次后重放。
 *
 * ⚠️ openapi-fetch 是以**单个 Request 对象**调用自定义 fetch 的。若在这里用
 * `fetch(request, { headers })` 追加请求头，按 fetch 规范第二参数的 headers 会
 * **整体替换**原请求头，Content-Type: application/json 会被抹掉，后端随即报
 * "Content-Type 'application/octet-stream' is not supported"。所以必须基于原
 * 请求头复制一份再改写。
 *
 * 请求体先缓冲成 ArrayBuffer，401 刷新后才能重放同一份 body
 * （与 BFF proxy route 缓冲 arrayBuffer 是同一个理由）。
 */
export function createAuthFetch(
  store: CredentialStore,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const base = new Request(input as RequestInfo, init);
    const hasBody = base.method !== "GET" && base.method !== "HEAD";
    const body = hasBody ? await base.arrayBuffer() : undefined;

    const send = (token: string) => {
      const headers = new Headers(base.headers);
      headers.set("Authorization", `Bearer ${token}`);
      return guardNetwork(() =>
        fetchImpl(
          new Request(base.url, {
            method: base.method,
            headers,
            ...(body !== undefined ? { body } : {}),
          }),
        ),
      );
    };

    const token = await store.accessToken();
    const first = await send(token);
    if (first.status !== 401) return first;

    const rotated = await store.refresh();
    if (!rotated) return first;
    return send(rotated.accessToken);
  };
}

export function createApiClients(baseUrl: string, fetchImpl: typeof fetch) {
  const make = <P extends {}>(domain: string) =>
    createClient<P>({
      baseUrl: `${baseUrl.replace(/\/+$/, "")}/api/${domain}`,
      fetch: fetchImpl,
      // springdoc 的包装对象 query 必须展平，否则 Spring 不绑定
      querySerializer: flattenedDtoQuerySerializer,
    });

  return {
    auth: make<AuthPaths>(DOMAINS.auth),
    system: make<SystemPaths>(DOMAINS.system),
    note: make<NotePaths>(DOMAINS.note),
    file: make<FilePaths>(DOMAINS.file),
    ai: make<AiPaths>(DOMAINS.ai),
    notify: make<NotifyPaths>(DOMAINS.notify),
  };
}

export type ApiClients = ReturnType<typeof createApiClients>;

/**
 * 不带 Bearer 的认证端点客户端：登录、注册、刷新、登出都在拿到 token 之前 / 之外发生，
 * 不能走 createAuthFetch，否则会递归回刷新逻辑。
 */
export function createAnonymousAuthClient(baseUrl: string, fetchImpl: typeof fetch = fetch) {
  return createClient<AuthPaths>({
    baseUrl: `${baseUrl.replace(/\/+$/, "")}/api/${DOMAINS.auth}`,
    fetch: (request: Request) => guardNetwork(() => fetchImpl(request)),
  });
}

export type AnonymousAuthClient = ReturnType<typeof createAnonymousAuthClient>;

export type { TokenPair };
