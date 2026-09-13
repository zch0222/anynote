"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";

const authorizeResultSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  redirectTo: z.string().min(1),
});

export type CliAuthorizeInput = {
  port: number;
  state: string;
  codeChallenge: string;
};

export type CliAuthorizeResult = z.infer<typeof authorizeResultSchema>;

/**
 * 用当前会话换一个**一次性授权码**，随后浏览器跳到 CLI 的回环地址把 code 交回去。
 *
 * 拿到的绝不是 Token——那是刻意的：Token 若经过浏览器地址栏就会留在历史记录、
 * Referer 与中间层日志里，而 code 只有 60 秒寿命且必须配合 CLI 私藏的 PKCE verifier
 * 才能兑换（见 `app/api/auth/cli-exchange/route.ts`）。
 *
 * 与 `useMe` 一样走普通 fetch：`/api/auth/cli-token` 是 **BFF 自有端点**，
 * 不在 OpenAPI 契约里，因此不该用 `@anynote/api-client` 的 typed client。
 */
export function useCliAuthorizeMutation() {
  return useMutation({
    mutationFn: async (input: CliAuthorizeInput): Promise<CliAuthorizeResult> => {
      let response: Response;
      try {
        response = await fetch("/api/auth/cli-token", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new Error("网络连接失败，请稍后重试");
      }
      return unwrapEnvelope(response, authorizeResultSchema.parse);
    },
    retry: false,
    gcTime: 0,
  });
}
