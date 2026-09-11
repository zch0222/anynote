import "server-only";
import { systemClient } from "@/lib/auth/backend";
import { readAuthResult, upstreamUnavailable } from "@/lib/auth/http";
import {
  type TokenPair,
  applyRefreshFailure,
  refreshWithLock,
  sessionExpired,
} from "@/lib/auth/refresh";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clearAuthCookies } from "./cookies";

// 白名单重建响应；后端实体里的 password、params、审计字段不进浏览器。
export const profileSchema = z.object({
  id: z.number().nullish(),
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  avatar: z.string().nullish(),
  sex: z.number().nullish(),
  email: z.string().nullish(),
  phoneNumber: z.string().nullish(),
  loginDate: z.string().nullish(),
  loginIp: z.string().nullish(),
  remark: z.string().nullish(),
  // role 字段按生成契约的 SysRole 可选字段对齐；looseObject 放行后端新增字段。
  role: z
    .looseObject({
      id: z.number().optional(),
      roleKey: z.string().optional(),
      roleName: z.string().optional(),
    })
    .nullish(),
});

export type SessionProfile = z.infer<typeof profileSchema>;

export type SessionOutcome =
  | { ok: true; profile: SessionProfile; rotated: TokenPair | undefined }
  | { ok: false; response: NextResponse };

async function fetchProfile(accessToken: string) {
  try {
    return readAuthResult(
      await systemClient.GET("/user/mine", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      }),
    );
  } catch (error) {
    console.error("[bff] /user/mine 上游调用失败", error);
    return { error: upstreamUnavailable() } as const;
  }
}

/**
 * 用请求里的会话 Cookie 换取当前用户资料，必要时先刷新 Token。
 *
 * `/api/auth/me` 与 `/api/auth/collab-token` 共用这段逻辑：两者都需要
 * 「已验证的当前用户身份」，且刷新与失效的处理方式必须完全一致。
 */
export async function loadSessionProfile(request: NextRequest): Promise<SessionOutcome> {
  let accessToken = request.cookies.get("at")?.value;
  // 缺失的 Cookie 统一成空串，交给与下面守卫互补的类型收窄。
  const refreshToken = request.cookies.get("rt")?.value ?? "";
  if (!accessToken && !refreshToken) {
    return { ok: false, response: clearAuthCookies(sessionExpired()) };
  }

  let rotated: TokenPair | undefined;
  // at 过期后浏览器会直接删掉该 Cookie，此时仅凭 rt 先刷新再拉取资料。
  if (!accessToken) {
    const outcome = await refreshWithLock(refreshToken);
    if (!outcome.ok) return { ok: false, response: applyRefreshFailure(outcome.response) };
    accessToken = outcome.token.accessToken;
    rotated = outcome.token;
  }

  let result = await fetchProfile(accessToken);
  if (result.error?.status === 401 && refreshToken && !rotated) {
    const outcome = await refreshWithLock(refreshToken);
    if (!outcome.ok) return { ok: false, response: applyRefreshFailure(outcome.response) };
    result = await fetchProfile(outcome.token.accessToken);
    rotated = outcome.token;
  }
  if (result.error) return { ok: false, response: applyRefreshFailure(result.error) };

  try {
    return { ok: true, profile: profileSchema.parse(result.data), rotated };
  } catch (error) {
    console.error("[bff] /user/mine 响应不符合白名单结构", error);
    return { ok: false, response: upstreamUnavailable() };
  }
}
