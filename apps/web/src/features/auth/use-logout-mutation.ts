"use client";

import { unwrapEnvelope } from "@/lib/api/errors";
import type { paths } from "@anynote/api-client/src/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import createClient from "openapi-fetch";
import { z } from "zod";

const client = createClient<paths>({ baseUrl: "/api/auth", credentials: "same-origin" });

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      // BFF 从 httpOnly Cookie 读取凭据，浏览器只发送空请求体。
      const { response } = await client.POST("/logout", {
        body: {},
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      await unwrapEnvelope(response, z.unknown().parse);
    },
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      router.replace("/login");
      router.refresh();
    },
    retry: false,
  });
}
