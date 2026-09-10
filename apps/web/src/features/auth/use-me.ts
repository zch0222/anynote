"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import { useQuery } from "@tanstack/react-query";
import { authQueryKeys } from "./query-keys";
import { type MeProfile, meProfileSchema } from "./schemas";

// me 是 BFF 自有端点（不在 OpenAPI 契约里），手动拆 ResData 信封。
// 401 说明 BFF 刷新后仍失败，会话已终结，由调用方决定跳转登录页。
export function useMe() {
  return useQuery({
    queryKey: authQueryKeys.me,
    queryFn: async (): Promise<MeProfile> => {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
        signal: AbortSignal.timeout(10_000),
      });
      return unwrapEnvelope(response, meProfileSchema.parse);
    },
  });
}
