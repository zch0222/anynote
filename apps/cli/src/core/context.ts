import { unwrapEnvelope } from "@anynote/api-core";
import { z } from "zod";
import { openBrowser } from "../auth/browser";
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
  /** 打开系统浏览器；单测注入假实现 */
  openBrowser: (url: string) => Promise<boolean>;
  /** 访问 Web 前端（兑换授权码）用的 fetch；单测打桩，避免真的打网络 */
  webFetch: typeof fetch;
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
  /** 打开浏览器的实现；单测注入假实现，避免真的弹窗 */
  openBrowser?: (url: string) => Promise<boolean>;
  /** 访问 Web 前端的 fetch；单测注入打桩实现 */
  webFetch?: typeof fetch;
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
    // ANYNOTE_OPEN_BROWSER=0 时强制走"打不开"分支：仍然打印链接，但不 spawn 浏览器。
    openBrowser: options.openBrowser ?? (options.env.openBrowser ? openBrowser : async () => false),
    webFetch: options.webFetch ?? fetch,
  };
}
