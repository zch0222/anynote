import { unwrapEnvelope } from "@anynote/api-core";
import { z } from "zod";
import { AuthFlowError, NetworkError, isNetworkFailure } from "../core/exit";
import { openBrowser } from "./browser";
import { type LoopbackServer, startLoopbackServer } from "./loopback";
import { buildAuthorizeUrl, createAuthorizationSecrets } from "./pkce";
import type { TokenPair } from "./store";

/** 浏览器授权登录的默认等待时长；用户可能要先登录，给足时间。 */
export const DEFAULT_AUTH_TIMEOUT_MS = 300_000;

const exchangeSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().nullish(),
  username: z.string().nullish(),
});

export type BrowserLoginDeps = {
  /** Web 前端地址（授权页所在站点） */
  webUrl: string;
  /** BFF 自有端点的绝对地址；与授权页同源，避免 CORS 与 Cookie 作用域问题 */
  webOrigin: string;
  timeoutMs?: number;
  /** 单测注入：默认走系统浏览器 */
  openBrowser?: (url: string) => Promise<boolean>;
  /** 单测注入：默认内核分配端口 */
  port?: number;
  /** 人类模式下的提示输出 */
  onNotice?: (message: string) => void;
  fetchImpl?: typeof fetch;
};

export type BrowserLoginResult = TokenPair & { username: string | null };

/**
 * 浏览器授权登录。
 *
 * 与口令登录的关键区别：CLI **不接触用户口令**，也不需要把 Token 经手浏览器——
 * 浏览器只传一个 60 秒有效的一次性授权码，Token 由本函数用 code + PKCE verifier
 * 从 BFF 直接换回。回环服务只监听 127.0.0.1，且兑换走本机直连。
 *
 * 失败一律抛错（`AuthFlowError` 用于超时 / 取消 / 端口占用 → 退出码 3，
 * `NetworkError` 用于连不上 → 退出码 4），由上层决定是否提示用户改用
 * `--password-stdin`——这里不自己做 fallback，否则用户会莫名其妙地被要求输口令。
 */
export async function browserLogin(deps: BrowserLoginDeps): Promise<BrowserLoginResult> {
  const secrets = createAuthorizationSecrets();
  const server = await startLoopbackServer({
    state: secrets.state,
    ...(deps.port !== undefined ? { port: deps.port } : {}),
  });

  const authorizeUrl = buildAuthorizeUrl(deps.webUrl, secrets, server.port);

  try {
    const opened = await (deps.openBrowser ?? openBrowser)(authorizeUrl);
    if (!opened) {
      deps.onNotice?.(`无法自动打开浏览器，请手工访问以下地址完成授权：\n${authorizeUrl}\n`);
    } else {
      deps.onNotice?.(`已打开浏览器，请在页面上确认授权：\n${authorizeUrl}\n`);
    }

    const callback = await server.waitForCode({
      timeoutMs: deps.timeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS,
    });
    // state 已由回环服务在收到请求时校验；这里再断言一次，防止将来有人改动那边。
    if (callback.state !== secrets.state) {
      throw new AuthFlowError("授权回调的 state 与本次请求不一致，请重新执行 anynote auth login");
    }

    return await exchangeCode({
      origin: deps.webOrigin,
      code: callback.code,
      codeVerifier: secrets.codeVerifier,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
  } finally {
    // 无论成功、超时还是异常都要关掉监听，否则端口会一直被本进程占着。
    await server.close();
  }
}

/**
 * 用授权码 + PKCE verifier 兑换令牌。
 *
 * 走 BFF 自有端点（`/api/auth/cli-exchange`）而不是后端 `/api/auth/cli/token`：
 * 授权码本来就存在 BFF 进程内存里，只有它能兑换；后端的 `/cli/token` 已由 BFF
 * 在用户点授权时就调用过了。
 */
export async function exchangeCode(input: {
  origin: string;
  code: string;
  codeVerifier: string;
  fetchImpl?: typeof fetch;
}): Promise<BrowserLoginResult> {
  const send = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await send(`${input.origin}/api/auth/cli-exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: input.code, codeVerifier: input.codeVerifier }),
    });
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new NetworkError("无法连接 Anynote 前端服务，确认 Web 站点已启动且能访问", {
        cause: error,
      });
    }
    throw error;
  }

  const token = await unwrapEnvelope(response, exchangeSchema.parse);
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    username: token.username ?? null,
  };
}

export type { LoopbackServer };
