import { clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies";
import { authResponse, checkOrigin } from "@/lib/auth/http";
import { applyRefreshFailure, refreshWithLock, sessionExpired } from "@/lib/auth/refresh";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const forbidden = checkOrigin(request);
  if (forbidden) return forbidden;

  const refreshToken = request.cookies.get("rt")?.value;
  if (!refreshToken) return clearAuthCookies(sessionExpired());

  const outcome = await refreshWithLock(refreshToken);
  if (outcome.ok) {
    const response = authResponse("00000", "操作成功");
    setAuthCookies(response, outcome.token);
    return response;
  }
  return applyRefreshFailure(outcome.response);
}
