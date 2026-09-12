import { unwrapEnvelope } from "@anynote/api-core";
import { z } from "zod";
import { defineCommand, result } from "../core/command";
import type { CliContext } from "../core/context";
import { UsageError } from "../core/exit";

const tokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpirationTime: z.number().nullish(),
});

const loginSchema = z.object({
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  role: z.string().nullish(),
  token: tokenSchema,
});

const userSchema = z.object({
  id: z.number(),
  username: z.string().nullish(),
  nickname: z.string().nullish(),
  email: z.string().nullish(),
});

/** 从 stdin 读口令：避免 `--password` 明文进入 shell history 与 ps 输出。 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
}

async function resolvePassword(
  ctx: CliContext,
  args: { password?: string | undefined; passwordStdin?: boolean },
): Promise<string> {
  if (args.passwordStdin) {
    const password = await readStdin();
    if (!password) throw new UsageError("--password-stdin 没有读到内容");
    return password;
  }
  if (args.password) {
    ctx.io.err("警告：--password 会进入 shell history 与进程列表，建议改用 --password-stdin\n");
    return args.password;
  }
  throw new UsageError("需要 --password-stdin（推荐）或 --password 提供口令");
}

export const authLogin = defineCommand({
  name: "auth login",
  summary: "登录并把凭据写入本地 profile",
  description:
    "用用户名口令换取 accessToken / refreshToken 并落盘到 profile。口令优先用 --password-stdin 从标准输入读取。" +
    "不想落盘时改用环境变量 ANYNOTE_TOKEN。",
  endpoint: "POST /api/auth/login",
  mutating: true,
  confirm: false,
  args: z.object({
    username: z.string().min(1).describe("用户名"),
    password: z.string().min(1).optional().describe("口令（不推荐，会进 shell history）"),
    passwordStdin: z.boolean().default(false).describe("从标准输入读取口令"),
  }),
  examples: [{ cmd: "anynote auth login --username alice --password-stdin < pw.txt" }],
  run: async (ctx, args) => {
    const password = await resolvePassword(ctx, args);
    const { response } = await ctx.authApi.POST("/login", {
      body: { username: args.username, password },
      parseAs: "stream",
    });
    const login = await unwrapEnvelope(response, loginSchema.parse);
    await ctx.credentials.saveProfile({
      apiUrl: ctx.env.apiUrl,
      accessToken: login.token.accessToken,
      refreshToken: login.token.refreshToken,
      username: login.username ?? args.username,
      obtainedAt: ctx.now(),
    });
    return result(
      {
        profile: ctx.credentials.profileName,
        username: login.username ?? args.username,
        nickname: login.nickname ?? null,
        apiUrl: ctx.env.apiUrl,
        credentialsPath: ctx.credentials.filePath,
      },
      { render: (data) => `已登录 ${data.username}，凭据写入 ${data.credentialsPath}` },
    );
  },
});

export const authRegister = defineCommand({
  name: "auth register",
  summary: "注册新账号并登录",
  description:
    "创建账号后自动写入本地 profile。用户名 6-15 位字母数字；口令 8-15 位且必须同时含大写、小写与数字。",
  endpoint: "POST /api/auth/register",
  mutating: true,
  confirm: false,
  args: z.object({
    username: z
      .string()
      .regex(/^[a-zA-Z0-9]{6,15}$/, "用户名必须是 6-15 位字母或数字")
      .describe("用户名"),
    password: z.string().min(1).optional().describe("口令（不推荐，会进 shell history）"),
    passwordStdin: z.boolean().default(false).describe("从标准输入读取口令"),
    nickname: z.string().min(1).describe("昵称"),
    sex: z.coerce.number().int().min(0).max(1).default(0).describe("性别：0 或 1"),
  }),
  examples: [
    { cmd: "anynote auth register --username alice01 --nickname 小爱 --password-stdin < pw.txt" },
  ],
  run: async (ctx, args) => {
    const password = await resolvePassword(ctx, args);
    const { response } = await ctx.authApi.POST("/register", {
      body: { username: args.username, password, nickname: args.nickname, sex: args.sex },
      parseAs: "stream",
    });
    const login = await unwrapEnvelope(response, loginSchema.parse);
    await ctx.credentials.saveProfile({
      apiUrl: ctx.env.apiUrl,
      accessToken: login.token.accessToken,
      refreshToken: login.token.refreshToken,
      username: login.username ?? args.username,
      obtainedAt: ctx.now(),
    });
    return result(
      { username: login.username ?? args.username, profile: ctx.credentials.profileName },
      { render: (data) => `已注册并登录 ${data.username}` },
    );
  },
});

export const authLogout = defineCommand({
  name: "auth logout",
  summary: "撤销当前会话并清除本地凭据",
  description: "向后端撤销 accessToken / refreshToken（幂等），然后删除本地 profile。",
  endpoint: "POST /api/auth/logout",
  mutating: true,
  confirm: false,
  args: z.object({}),
  run: async (ctx) => {
    const profile = await ctx.credentials.readProfile();
    if (!profile) {
      return result({ revoked: false }, { render: () => "本地没有凭据，无需登出" });
    }
    const { response } = await ctx.authApi.POST("/logout", {
      body: { accessToken: profile.accessToken, refreshToken: profile.refreshToken },
      parseAs: "stream",
    });
    await unwrapEnvelope(response, () => null);
    await ctx.credentials.removeProfile();
    return result({ revoked: true }, { render: () => "已登出并清除本地凭据" });
  },
});

export const authWhoami = defineCommand({
  name: "auth whoami",
  summary: "查看当前登录用户",
  description: "调用 system 服务校验凭据是否真的可用；未认证时退出码为 3。",
  endpoint: "GET /api/system/user/mine",
  args: z.object({}),
  run: async (ctx) => {
    const { response } = await ctx.api.system.GET("/user/mine", { parseAs: "stream" });
    const user = await unwrapEnvelope(response, userSchema.parse);
    return result(user);
  },
});

export const authStatus = defineCommand({
  name: "auth status",
  summary: "查看本地凭据状态（不发请求）",
  description:
    "只读本地文件：当前 profile、网关地址、凭据是否存在与获取时间。不会打印 token 本身。",
  args: z.object({}),
  run: async (ctx) => {
    const profile = await ctx.credentials.readProfile();
    return result({
      profile: ctx.credentials.profileName,
      apiUrl: ctx.env.apiUrl,
      credentialsPath: ctx.credentials.filePath,
      source: ctx.credentials.usesEnvToken ? "ANYNOTE_TOKEN" : "profile",
      authenticated: ctx.credentials.usesEnvToken || Boolean(profile?.accessToken),
      username: profile?.username ?? null,
      obtainedAt: profile ? new Date(profile.obtainedAt).toISOString() : null,
    });
  },
});
