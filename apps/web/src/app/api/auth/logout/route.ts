import { authClient } from "@/lib/auth/backend";
import { clearAuthCookies } from "@/lib/auth/cookies";
import { authResponse, checkOrigin, readAuthResult, upstreamUnavailable } from "@/lib/auth/http";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const forbidden = checkOrigin(request);
  if (forbidden) return forbidden;

  const accessToken = request.cookies.get("at")?.value;
  const refreshToken = request.cookies.get("rt")?.value;

  if (!accessToken && !refreshToken) {
    return clearAuthCookies(authResponse("00000", "操作成功"));
  }

  try {
    const result = readAuthResult(
      await authClient.POST("/logout", {
        body: {
          ...(accessToken ? { accessToken } : {}),
          ...(refreshToken ? { refreshToken } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      }),
    );
    return clearAuthCookies(result.error ?? authResponse("00000", "操作成功"));
  } catch {
    return clearAuthCookies(upstreamUnavailable());
  }
}
