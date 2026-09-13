import { unwrapEnvelope } from "@anynote/api-core";
import { z } from "zod";
import { browserLogin } from "../auth/browser-login";
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
    "默认打开浏览器授权页：已登录的浏览器直接点「授权」即可，无需在终端输口令（口令路径永远接触不到用户口令）。" +
    "无浏览器环境（CI / ssh / agent）用 --password-stdin 从标准输入读口令，" +
    "或用 ANYNOTE_TOKEN 直接提供令牌（不落盘）。",
  endpoint: "POST /api/auth/login | GET /cli/authorize",
  mutating: true,
  confirm: false,
  args: z.object({
    username: z.string().min(1).optional().describe("用户名（仅口令登录需要）"),
    password: z.string().min(1).optional().describe("口令（不推荐，会进 shell history）"),
    passwordStdin: z.boolean().default(false).describe("从标准输入读取口令"),
    // 刻意用正向命名：run.ts 的通用选项构造器生成的是 `--<kebab>`，
    // `--no-browser` 这种否定式前缀会被 commander 当成取反选项，字段名对不上。
    passwordOnly: z
      .boolean()
      .default(false)
      .describe("跳过浏览器授权，强制用口令登录（等价于给出 --username）"),
    timeout: z.coerce.number().int().min(10).max(1800).default(300).describe("浏览器授权等待秒数"),
  }),
  examples: [
    { cmd: "anynote auth login", note: "推荐：打开浏览器点一下授权即可" },
    { cmd: "anynote auth login --username alice --password-stdin < pw.txt", note: "无浏览器环境" },
  ],
  run: async (ctx, args) => {
    // 给了口令相关参数（或显式要求口令登录）就走口令路径，否则走浏览器授权。
    const wantsPassword =
      args.passwordOnly ||
      args.passwordStdin ||
      args.password !== undefined ||
      args.username !== undefined;

    if (!wantsPassword) {
      return browserLoginCommand(ctx, args.timeout);
    }

    if (args.username === undefined) {
      throw new UsageError(
        "口令登录需要 --username；只想用浏览器授权就直接执行 anynote auth login",
      );
    }

    const password = await resolvePassword(ctx, args);
    const { response } = await ctx.authApi.POST("/login", {
      body: { username: args.username, password },
      parseAs: "stream",
    });
    const login = await unwrapEnvelope(response, loginSchema.parse);
    await saveLogin(ctx, {
      accessToken: login.token.accessToken,
      refreshToken: login.token.refreshToken,
      username: login.username ?? args.username,
      nickname: login.nickname ?? null,
    });
    return result(
      {
        profile: ctx.credentials.profileName,
        username: login.username ?? args.username,
        nickname: login.nickname ?? null,
        apiUrl: ctx.env.apiUrl,
        credentialsPath: ctx.credentials.filePath,
        method: "password",
      },
      { render: (data) => `已登录 ${data.username}，凭据写入 ${data.credentialsPath}` },
    );
  },
});

/** 浏览器授权登录：交给 `auth/browser-login.ts` 跑协议，这里只做落盘与渲染。 */
async function browserLoginCommand(ctx: CliContext, timeoutSeconds: number) {
  const credentialsPath = ctx.credentials.filePath;
  const login = await browserLogin({
    webUrl: ctx.env.webUrl,
    // 兑换接口与授权页同源，避免 Cookie 作用域与 CORS 问题。
    webOrigin: new URL(ctx.env.webUrl).origin,
    timeoutMs: timeoutSeconds * 1_000,
    openBrowser: ctx.openBrowser,
    fetchImpl: ctx.webFetch,
    onNotice: (message) => ctx.io.err(message),
  });

  // 先落盘再校验身份：`createAuthFetch` 一律用**凭据存储里**的 accessToken 覆盖
  // Authorization 头（它的职责就是注入 Bearer），所以想用新令牌打后端就必须先存。
  await saveLogin(ctx, {
    accessToken: login.accessToken,
    refreshToken: login.refreshToken,
    // BFF 的回显只能当临时值；下面 whoami 成功会用后端返回的真实用户名覆盖。
    username: login.username ?? "unknown",
    nickname: null,
  });

  const identity = await resolveIdentity(ctx);
  const username = identity?.username ?? login.username ?? "unknown";
  if (username !== (login.username ?? "unknown")) {
    const profile = await ctx.credentials.readProfile();
    if (profile) await ctx.credentials.saveProfile({ ...profile, username });
  }

  // whoami 打不通说明**数据面没配好**（最常见：api-url 指到了 Web 前端而不是网关）。
  // 此时凭据其实已经落盘、登录是成功的，但用户下一条命令必然失败——必须在 stderr
  // 明确说清，否则"登录成功"这句提示会把真正的问题盖住。
  if (!identity) {
    ctx.io.err(
      [
        `警告：已拿到令牌，但无法通过 ${ctx.env.apiUrl} 校验身份。`,
        "若后续命令报错，请确认 api-url 指向的是 Gateway 而不是 Web 前端：",
        "  anynote config get            # 看 apiUrl 与来源",
        "",
      ].join("\n"),
    );
  }

  return result(
    {
      profile: ctx.credentials.profileName,
      username,
      nickname: null,
      apiUrl: ctx.env.apiUrl,
      webUrl: ctx.env.webUrl,
      credentialsPath,
      method: "browser",
      // 让 agent 不必解析 stderr 就能知道数据面是否已通
      verified: identity !== null,
    },
    {
      render: (data) =>
        `已通过浏览器授权登录 ${data.username}，凭据写入 ${data.credentialsPath}${
          data.verified ? "" : "\n⚠️ 尚未通过网关校验，见上方警告"
        }`,
    },
  );
}

/**
 * 用刚落盘的凭据问一次后端"我是谁"。
 *
 * 授权响应里的 username 只是 BFF 的善意回显，不能当身份依据；`/user/mine` 既确认
 * 令牌真的可用，也拿到权威的用户名。拿不到就返回 null 让调用方保留回显值——
 * 不该因为一次探测失败就让已经到手的登录作废，但调用方**必须**把这件事告诉用户。
 */
async function resolveIdentity(ctx: CliContext): Promise<{ username: string | null } | null> {
  try {
    const { response } = await ctx.api.system.GET("/user/mine", { parseAs: "stream" });
    const user = await unwrapEnvelope(response, userSchema.parse);
    return { username: user.username ?? null };
  } catch {
    return null;
  }
}

async function saveLogin(
  ctx: CliContext,
  input: { accessToken: string; refreshToken: string; username: string; nickname: string | null },
) {
  await ctx.credentials.saveProfile({
    apiUrl: ctx.env.apiUrl,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    username: input.username,
    obtainedAt: ctx.now(),
  });
}

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
