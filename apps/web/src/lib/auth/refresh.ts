import "server-only";
import type { components } from "@anynote/api-client/src/auth";
import type { NextResponse } from "next/server";
import { z } from "zod";
import { authClient } from "./backend";
import { clearAuthCookies } from "./cookies";
import { authResponse, readAuthResult, upstreamUnavailable } from "./http";

export type TokenPair = Required<
  Pick<components["schemas"]["Token"], "accessToken" | "refreshToken">
>;

export type RefreshOutcome = { ok: true; token: TokenPair } | { ok: false; response: NextResponse };

const tokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

// dev HMR 与分路由打包都可能重新实例化本模块，单飞锁必须挂在进程级对象上，
// 才能保证同一 rt 的并发刷新在进程内只打一次后端。
const globalStore = globalThis as typeof globalThis & {
  __anynoteRefreshInflight?: Map<string, Promise<RefreshOutcome>>;
};
if (!globalStore.__anynoteRefreshInflight) {
  globalStore.__anynoteRefreshInflight = new Map<string, Promise<RefreshOutcome>>();
}
const inflight = globalStore.__anynoteRefreshInflight;

export function refreshWithLock(refreshToken: string): Promise<RefreshOutcome> {
  const existing = inflight.get(refreshToken);
  if (existing) return existing;

  const pending = (async (): Promise<RefreshOutcome> => {
    try {
      const result = readAuthResult(
        await authClient.POST("/refresh", {
          body: { refreshToken },
          signal: AbortSignal.timeout(10_000),
        }),
      );
      if (result.error) return { ok: false, response: result.error };

      const token = tokenSchema.parse(result.data);
      return { ok: true, token };
    } catch (error) {
      console.error("[bff] /auth/refresh 上游调用失败", error);
      return { ok: false, response: upstreamUnavailable() };
    }
  })().finally(() => {
    // 无论成败都立即释放；刷新成功即旋转，旧 rt 不会再次进入该分支。
    inflight.delete(refreshToken);
  });

  inflight.set(refreshToken, pending);
  return pending;
}

export function sessionExpired() {
  return authResponse("A0311", "登录状态已过期，请重新登录", null, 401);
}

export function applyRefreshFailure(response: NextResponse) {
  // 401 说明会话确实失效（rt 已旋转或被撤销），清 Cookie 让客户端回到登录页；
  // 5xx 属上游瞬时故障，保留 Cookie 以便稍后重试。
  return response.status === 401 ? clearAuthCookies(response) : response;
}
