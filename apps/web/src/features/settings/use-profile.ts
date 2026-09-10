"use client";

import { authQueryKeys } from "@/features/auth/query-keys";
import { unwrapEnvelope } from "@/lib/api/errors";
import { authApi, systemApi } from "@/lib/api/openapi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

/** 设置域 query key：资料查询与 auth/me 不同源（这里直读 system 域完整资料）。 */
export const settingsQueryKeys = {
  all: ["settings"] as const,
  profile: ["settings", "profile"] as const,
};

/** 完整个人资料（system /user/mine → SysUser 白名单子集）。 */
export const profileSchema = z.object({
  id: z.number().nullish(),
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  email: z.string().nullish(),
  phoneNumber: z.string().nullish(),
  sex: z.number().nullish(),
  remark: z.string().nullish(),
});
export type Profile = z.infer<typeof profileSchema>;

const resetPasswordSchema = z.object({
  oldPassword: z.string().min(1, "请输入原密码"),
  newPassword: z
    .string()
    .regex(
      /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])[a-zA-Z0-9]{8,15}$/,
      "8-15 位，需包含大小写字母和数字",
    ),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export function validateResetPassword(input: unknown) {
  return resetPasswordSchema.safeParse(input);
}

export function useMyProfileQuery() {
  return useQuery({
    queryKey: settingsQueryKeys.profile,
    staleTime: 30_000,
    queryFn: async (): Promise<Profile> => {
      const { response } = await systemApi.GET("/user/mine", {
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, profileSchema.parse);
    },
  });
}

/**
 * 更新资料（PUT /user/{userId}）。后端 updateById 忽略 null 字段：
 * 只传用户可编辑的字段 + id，其余留空不落库。
 */
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ profile }: { profile: Profile }) => {
      if (!profile.id) {
        throw new Error("缺少用户 ID");
      }
      const body = {
        id: profile.id,
        ...(profile.nickname ? { nickname: profile.nickname } : {}),
        ...(profile.email ? { email: profile.email } : {}),
        ...(profile.phoneNumber ? { phoneNumber: profile.phoneNumber } : {}),
        ...(profile.sex !== null && profile.sex !== undefined ? { sex: profile.sex } : {}),
        ...(profile.remark ? { remark: profile.remark } : {}),
      };
      const { response } = await systemApi.PUT("/user/{userId}", {
        params: { path: { userId: profile.id } },
        body,
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, () => undefined);
    },
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKeys.profile });
      // 顶栏/侧栏显示的昵称来自 auth/me，一并刷新
      queryClient.invalidateQueries({ queryKey: authQueryKeys.me });
    },
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: async (input: ResetPasswordInput) => {
      const { response } = await authApi.POST("/resetPassword", {
        body: input,
        parseAs: "stream",
        signal: AbortSignal.timeout(15_000),
      });
      return unwrapEnvelope(response, () => undefined);
    },
    retry: false,
  });
}
