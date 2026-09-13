import { authClient } from "@/lib/auth/backend";
import { buildLoopbackCallbackUrl } from "@/lib/auth/cli-authorize";
import { issueCliCode } from "@/lib/auth/cli-code-store";
import { cliTokenRequestSchema } from "@/lib/auth/cli-schemas";
import { setAuthCookies } from "@/lib/auth/cookies";
import { authResponse, checkOrigin, readAuthResult, upstreamUnavailable } from "@/lib/auth/http";
import { loadSessionProfile } from "@/lib/auth/profile";
import type { NextRequest } from "next/server";
import { z } from "zod";

/** 后端 `POST /api/auth/cli/token` 的响应；只取 BFF 需要的字段。 */
const cliTokenSchema = z.object({
  username: z.string().min(1),
  nickname: z.string().nullish(),
  token: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
  }),
});

/**
 * CLI 授权登录：把浏览器会话换成一个**一次性授权码**交给 CLI。
 *
 * 为什么不让 CLI 直接拿 Token：Token 一旦进浏览器地址栏就会留在历史记录、Referer 与
 * 中间层日志里。这里改成——浏览器只拿到 60 秒有效的短码，Token 存在服务端内存，
 * 由 CLI 带着 PKCE verifier 从 `/api/auth/cli/exchange` 取走。**本响应体里绝不含 Token。**
 *
 * 三道闸：
 * 1. `checkOrigin`——只接受同源页面发起的请求（CSRF）；
 * 2. `loadSessionProfile`——必须有有效会话 Cookie，未登录直接 401，前端据此跳登录页；
 * 3. 参数校验——`port` 必须是回环端口段、`state`/`challenge` 必须是 base64url。
 *
 * 「点一次授权」这一条由页面保证：本端点只被用户手势触发的请求调用，不做任何自动跳转。
 */
export async function POST(request: NextRequest) {
  const forbidden = checkOrigin(request);
  if (forbidden) return forbidden;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return authResponse("A0160", "请求体必须是有效 JSON", null, 400);
  }

  const parsed = cliTokenRequestSchema.safeParse(payload);
  if (!parsed.success) return authResponse("A0160", "请求参数错误", null, 400);

  const outcome = await loadSessionProfile(request);
  if (!outcome.ok) return outcome.response;

  // loadSessionProfile 只在刷新过时才回传 token；否则用请求里带的那一个。
  const accessToken = outcome.rotated?.accessToken ?? request.cookies.get("at")?.value;
  if (!accessToken) {
    return authResponse("A0311", "登录状态已过期，请重新登录", null, 401);
  }

  try {
    // 身份来自会话 Cookie 对应的 Bearer Token；后端据此为 CLI **另发**一对令牌。
    const result = readAuthResult(
      await authClient.POST("/cli/token", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      }),
    );
    if (result.error) return result.error;

    const { username, token } = cliTokenSchema.parse(result.data);

    // Token 只进服务端内存，与 code 绑定；浏览器拿到的 code 单独无法兑换。
    const code = issueCliCode({
      username,
      challenge: parsed.data.codeChallenge,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
    });

    const response = authResponse("00000", "操作成功", {
      code,
      state: parsed.data.state,
      redirectTo: buildLoopbackCallbackUrl(parsed.data.port, {
        code,
        state: parsed.data.state,
      }),
    });
    // 取资料时顺带刷新过 Token 的话，把新 Cookie 一起带回去。
    if (outcome.rotated) setAuthCookies(response, outcome.rotated);
    return response;
  } catch (error) {
    console.error("[bff] /cli/token 处理失败", error);
    return upstreamUnavailable();
  }
}
