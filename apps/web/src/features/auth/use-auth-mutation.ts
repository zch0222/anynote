"use client";

import type { paths } from "@anynote/api-client/src/auth";
import { useMutation } from "@tanstack/react-query";
import createClient from "openapi-fetch";
import { z } from "zod";
import type { LoginInput, RegisterInput } from "./schemas";

// 浏览器只调用同源 BFF；请求 DTO 来自生成契约，认证响应只检查状态。
const client = createClient<paths>({ baseUrl: "/api/auth", credentials: "same-origin" });
const resultSchema = z.object({ code: z.string().min(1), msg: z.string().optional() });

async function authenticate(
  send: () => Promise<{ data?: unknown; error?: unknown; response: Response }>,
) {
  let result: Awaited<ReturnType<typeof send>>;
  try {
    result = await send();
  } catch {
    throw new Error("网络连接失败，请稍后重试");
  }
  const parsed = resultSchema.safeParse(result.data ?? result.error);
  if (!parsed.success) throw new Error("认证服务响应异常，请稍后重试");
  if (!result.response.ok || parsed.data.code !== "00000") {
    throw new Error(parsed.data.msg || "认证失败，请稍后重试");
  }
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      authenticate(() =>
        client.POST("/login", { body: input, signal: AbortSignal.timeout(15_000) }),
      ),
    retry: false,
    gcTime: 0,
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: ({ email, ...input }: RegisterInput) =>
      authenticate(() =>
        client.POST("/register", {
          body: { ...input, ...(email === undefined ? {} : { email }) },
          signal: AbortSignal.timeout(15_000),
        }),
      ),
    retry: false,
    gcTime: 0,
  });
}
