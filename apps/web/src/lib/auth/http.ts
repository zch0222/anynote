import "server-only";
import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import { z } from "zod";

export function authResponse(code: string, msg: string, data: unknown = null, status = 200) {
  return NextResponse.json(
    { code, msg, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function upstreamUnavailable() {
  return authResponse("B0400", "认证服务暂时不可用", null, 502);
}

export function checkOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(env.NEXT_PUBLIC_APP_URL).origin) {
    return authResponse("A0301", "请求来源不受信任", null, 403);
  }
}

const envelopeSchema = z.object({
  code: z.string().min(1),
  msg: z.string().optional(),
  data: z.unknown().optional(),
});

export function readAuthResult(result: {
  data?: unknown;
  error?: unknown;
  response: Response;
}) {
  const parsed = envelopeSchema.safeParse(result.data ?? result.error);
  if (!parsed.success || result.response.status >= 500) {
    return { error: upstreamUnavailable() };
  }

  const { code, msg, data } = parsed.data;
  if (code !== "00000") {
    // 后端业务失败可能仍是 HTTP 200；只返回错误码和消息，不透传任意 data。
    return {
      error: authResponse(code, msg ?? "认证请求失败", null, result.response.status),
    };
  }

  if (!result.response.ok) return { error: upstreamUnavailable() };
  return { data };
}
