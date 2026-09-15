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

/**
 * `sys_user.sex` 的取值（与后端 `UpdateMyProfileDTO` 的 `@NotNull` 口径一致）。
 *
 * **未设置是 2，不是 null**：数据库列是 `tinyint` 且注册时必填，从来就没有过
 * "空"这个状态；早先前端用 `null` 表示未设置，保存时会被后端的 `@NotNull` 拒掉。
 */
export const SEX_UNSET = 2;
export const SEX_MALE = 0;
export const SEX_FEMALE = 1;

/** 性别下拉的三个选项。顺序按"未设置 → 男 → 女"，与设计稿 D-12 `a-sex` 一致。 */
export const SEX_OPTIONS: { value: number; label: string }[] = [
  { value: SEX_UNSET, label: "未设置" },
  { value: SEX_MALE, label: "男" },
  { value: SEX_FEMALE, label: "女" },
];

/** 昵称上限，与后端 `@Size(max = 30)` 和后端 `sys_user.nickname` 列宽一致。 */
export const NICKNAME_MAX_LENGTH = 30;

/** B-3 `UpdateMyProfileDTO`：四个字段全量提交，`""` 表示清空。 */
export type UpdateMyProfileInput = {
  nickname: string;
  sex: number;
  email: string;
  phoneNumber: string;
};

/**
 * 取表单可编辑的四元组（服务端资料的投影）。
 *
 * 单独抽出来是因为它有三处要用：hydrate 表单、算 dirty、以及重试时回到服务端值。
 * `sex` 在这里就把 `null` 收敛成 `SEX_UNSET`——表单内部只认 0 / 1 / 2 这三态，
 * 不再到处写"null 也算未设置"。
 */
export function toProfileForm(profile: Profile | undefined): UpdateMyProfileInput {
  return {
    nickname: profile?.nickname ?? "",
    sex: profile?.sex ?? SEX_UNSET,
    email: profile?.email ?? "",
    phoneNumber: profile?.phoneNumber ?? "",
  };
}

/**
 * 表单是否与服务端值不一致（D-12 图例 17）。
 *
 * 逐字段比较而不是用 react-hook-form 的 `isDirty`：`isDirty` 会把"改了又改回来"
 * 也算成脏，用户看到「有未保存的修改」却发现点保存什么都不会变，
 * 比少一个提示更让人困惑。比较前先 `trim`：提交前也会 trim，
 * 只多打了一个空格不该把保存按钮点亮。
 */
export function isProfileDirty(form: UpdateMyProfileInput, profile: Profile | undefined): boolean {
  const base = toProfileForm(profile);
  return (
    base.nickname !== form.nickname.trim() ||
    base.sex !== form.sex ||
    base.email !== form.email.trim() ||
    base.phoneNumber !== form.phoneNumber.trim()
  );
}

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

/**
 * 密码规则清单（D-12 图例 24 · M-11 图例 13）。
 *
 * 与 `resetPasswordSchema` 的正则逐条对应，但拆成四行是为了**实时**给反馈：
 * 正则只会在提交时给出"不满足"这一个结论，而用户需要知道**差哪一条**。
 * 两处必须同时改——单测把四条规则和 schema 钉在一起了。
 */
export const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: "8–15 位", test: (value) => value.length >= 8 && value.length <= 15 },
  { label: "含大写字母", test: (value) => /[A-Z]/.test(value) },
  { label: "含小写字母", test: (value) => /[a-z]/.test(value) },
  { label: "含数字", test: (value) => /[0-9]/.test(value) },
];

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

/*
 * B-3（`PUT /user/mine/profile`）由后端另一个分支实现，`openapi/specs/*.json`
 * 与 `packages/api-client/src/system.ts` 里可能还没有这个路径。生成物不能手改，
 * 所以把类型断言**隔离在这一个 helper 里**，调用点保持普通 typed client 写法，
 * 等 B-3 合入、重跑 `pnpm openapi:generate` 之后整体删除即可。
 */
// TODO(B-3 合入后清理)：删掉这个 helper，直接调 `systemApi.PUT("/user/mine/profile", …)`。
function putMyProfile(body: UpdateMyProfileInput) {
  const client = systemApi as unknown as {
    PUT: (
      path: "/user/mine/profile",
      init: {
        body: UpdateMyProfileInput;
        parseAs: "stream";
        signal: AbortSignal;
      },
    ) => Promise<{ response: Response }>;
  };
  return client.PUT("/user/mine/profile", {
    body,
    parseAs: "stream",
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * 更新本人资料（B-3 `PUT /user/mine/profile`）。
 *
 * 与旧的 `PUT /user/{userId}` 有三处关键差别：
 * 1. **不再传 userId**，身份由后端从登录态取——也就无从改别人的资料；
 * 2. **四个字段全量提交**。PUT 的语义就是整体替换，所以"清空邮箱"只需要传 `""`，
 *    不需要发明"没传 = 不改"与"传 null = 清空"这两套约定；
 * 3. 返回更新后的资料，直接写回缓存，省掉一次 `GET /user/mine` 往返。
 */
export function useUpdateMyProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateMyProfileInput): Promise<Profile> => {
      const { response } = await putMyProfile(input);
      return unwrapEnvelope(response, profileSchema.parse);
    },
    retry: false,
    onSuccess: (updated) => {
      // 用返回值直接落缓存，而不是 invalidate 后再拉一次：请求已经带回权威数据，
      // 再往返一次既慢又会出现"保存成功但表单还是旧值"的一帧。
      queryClient.setQueryData(settingsQueryKeys.profile, updated);
      // 顶栏/侧栏显示的昵称来自 auth/me，必须失效（那里拿不到 B-3 的返回值）
      queryClient.invalidateQueries({ queryKey: authQueryKeys.me });
    },
  });
}

/**
 * 旧签名的兼容层：`useUpdateProfileMutation({ profile })` → B-3 的四字段。
 *
 * 存在的唯一理由是移动端设置页（`components/mobile/**`，由另一条工作流改造中）
 * 还在用旧签名。它**指回同一个 mutation**，所以移动端此刻也一并走对了端点——
 * 旧的 `PUT /user/{userId}` 是 `@InnerAuth` 内部端点，浏览器调用一律被拒
 * （§1.4 第 5 条），保留旧实现等于让移动端继续保存失败。
 *
 * 移动端迁到 `useUpdateMyProfileMutation` 后，整个函数删除（含这段注释）。
 */
export function useUpdateProfileMutation() {
  const update = useUpdateMyProfileMutation();
  const toInput = ({ profile }: { profile: Profile }): UpdateMyProfileInput => ({
    nickname: profile.nickname?.trim() ?? "",
    sex: profile.sex ?? SEX_UNSET,
    email: profile.email?.trim() ?? "",
    phoneNumber: profile.phoneNumber?.trim() ?? "",
  });
  return {
    ...update,
    mutate: (variables: { profile: Profile }, options?: Parameters<typeof update.mutate>[1]) =>
      update.mutate(toInput(variables), options),
    mutateAsync: (variables: { profile: Profile }) => update.mutateAsync(toInput(variables)),
  };
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
