import type { components } from "@anynote/api-client/src/auth";
import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
}) satisfies z.ZodType<components["schemas"]["LoginRequestDTO"]>;

export const registerSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9]{6,15}$/, "用户名须为 6–15 位字母或数字"),
  password: z
    .string()
    .regex(
      /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])[a-zA-Z0-9]{8,15}$/,
      "密码须为 8–15 位，包含大小写字母和数字",
    ),
  nickname: z.string(),
  sex: z.union([z.literal(0), z.literal(1)]),
  email: z
    .string()
    .regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$|^$/, "请输入有效邮箱")
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

// /api/auth/me 的响应 data；BFF 已做服务端白名单，这里只校验前端用到的字段。
export const meProfileSchema = z.object({
  id: z.number().nullish(),
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  avatar: z.string().nullish(),
  role: z
    .looseObject({
      roleKey: z.string().optional(),
      roleName: z.string().optional(),
    })
    .nullish(),
});

export type MeProfile = z.infer<typeof meProfileSchema>;
