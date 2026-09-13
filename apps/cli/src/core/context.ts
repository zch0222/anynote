import { unwrapEnvelope } from "@anynote/api-core";
import { z } from "zod";
import { CredentialStore, type TokenPair } from "../auth/store";
import {
  type AnonymousAuthClient,
  type ApiClients,
  createAnonymousAuthClient,
  createApiClients,
  createAuthFetch,
} from "./api";
import type { RegisteredCommand } from "./command";
import type { CliEnv } from "./env";
import type { CliIo, OutputMode } from "./output";
import { SettingsStore } from "./settings";

export type CliContext = {
  /** 整个命令注册表；manifest / doctor 这类元命令需要读它，由入口注入避免模块循环 */
  commands: RegisteredCommand[];
  api: ApiClients;
  /** 不带 Bearer 的认证客户端：登录 / 注册 / 刷新 / 登出 */
  authApi: AnonymousAuthClient;
  credentials: CredentialStore;
  /** 持久化设置（apiUrl 等非敏感项），与凭据分开两个文件 */
  settings: SettingsStore;
  env: CliEnv;
  io: CliIo;
  now: () => number;
  mode: OutputMode;
  /** --yes：非交互确认写操作 */
  yes: boolean;
  /** --dry-run：只打印将要发送的请求 */
  dryRun: boolean;
  version: string;
};

const tokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

/** 刷新端点：`POST /api/auth/refresh`，返回 ResData<Token>。 */
export function createRefreshFn(authApi: AnonymousAuthClient) {
  return async (refreshToken: string): Promise<TokenPair> => {
    const { response } = await authApi.POST("/refresh", {
      body: { refreshToken },
      parseAs: "stream",
    });
    return unwrapEnvelope(response, tokenSchema.parse);
  };
}

export type ContextOptions = {
  commands: RegisteredCommand[];
  env: CliEnv;
  io: CliIo;
  mode: OutputMode;
  yes: boolean;
  dryRun: boolean;
  version: string;
  now?: () => number;
  /** 已有实例时复用（run.ts 在构造 env 之前就要读它拿 apiUrl） */
  settings?: SettingsStore;
};

export function createContext(options: ContextOptions): CliContext {
  const now = options.now ?? Date.now;
  const authApi = createAnonymousAuthClient(options.env.apiUrl);
  const credentials = new CredentialStore({
    configDir: options.env.configDir,
    profile: options.env.profile,
    envToken: options.env.token,
    now,
    refreshTokens: createRefreshFn(authApi),
  });
  return {
    commands: options.commands,
    api: createApiClients(options.env.apiUrl, createAuthFetch(credentials)),
    authApi,
    credentials,
    settings: options.settings ?? new SettingsStore(options.env.configDir),
    env: options.env,
    io: options.io,
    now,
    mode: options.mode,
    yes: options.yes,
    dryRun: options.dryRun,
    version: options.version,
  };
}
