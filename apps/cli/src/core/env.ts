import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Settings } from "./settings";

const apiUrlSchema = z.string().url();

const schema = z.object({
  /** Gateway 地址；CLI 直连 Gateway，不经 Next BFF */
  ANYNOTE_API_URL: apiUrlSchema.optional(),
  /** 直接提供 accessToken：不落盘、不刷新，过期即 exit 3。CI / agent 沙箱用 */
  ANYNOTE_TOKEN: z.string().min(1).optional(),
  /** 凭据 profile 名 */
  ANYNOTE_PROFILE: z.string().min(1).default("default"),
  /** 凭据与配置目录 */
  ANYNOTE_CONFIG_DIR: z.string().min(1).optional(),
  /** 置 1 强制 JSON 输出（等价于 --json） */
  ANYNOTE_JSON: z.string().optional(),
});

export const DEFAULT_API_URL = "http://localhost:8080";

export type CliEnv = {
  apiUrl: string;
  /** apiUrl 的来源：环境变量 / 设置文件 / 内置默认值，供 doctor 与 config path 展示 */
  apiUrlSource: "env" | "file" | "default";
  token: string | undefined;
  profile: string;
  configDir: string;
  forceJson: boolean;
};

/** 默认配置目录：Windows 用 APPDATA，其余用 ~/.anynote。 */
export function defaultConfigDir(platform: string, env: NodeJS.ProcessEnv): string {
  if (platform === "win32" && env.APPDATA) return path.join(env.APPDATA, "anynote");
  return path.join(os.homedir(), ".anynote");
}

/**
 * 配置文件必须能在**读环境变量之前**就定位到（设置文件里存着 apiUrl，而读 env 又需要它），
 * 所以目录解析独立成一步：只有 `ANYNOTE_CONFIG_DIR` 与平台默认两种来源。
 */
export function resolveConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): string {
  const override = env.ANYNOTE_CONFIG_DIR;
  if (override !== undefined && override !== "") return override;
  return defaultConfigDir(platform, env);
}

/**
 * 空字符串一律当作"没设置"。Windows 与 CI 里把变量置空是常见写法
 * （`ANYNOTE_TOKEN=""` 表示"不要用环境变量里的 token"），不能让它撞上 min(1) 校验。
 */
function dropEmpty(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
}

/** 去掉末尾斜杠：`http://gw//` 会拼出 `/api` 之前多一个斜杠。 */
export function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * 环境变量不合法时报错。设置文件里的值由读取方单独校验（见 `resolveApiUrl`），
 * 不合法的落盘值要能被忽略而不是让所有命令都起不来。
 */
function parse(source: NodeJS.ProcessEnv) {
  const parsed = schema.safeParse(dropEmpty(source));
  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
    throw new Error(`环境变量不合法：${fields}`);
  }
  return parsed.data;
}

/**
 * 网关地址的优先级：`ANYNOTE_API_URL` > `--api-url`（由 run.ts 折进环境变量）> 设置文件 > 默认值。
 * 打印出来的 `source` 是给 `config path` / `doctor` 用的，让"我现在连的到底是哪"一眼可见。
 */
export function resolveApiUrl(
  env: NodeJS.ProcessEnv,
  settings: Settings,
): { url: string; source: "env" | "file" | "default" } {
  const fromEnv = parse(env).ANYNOTE_API_URL;
  if (fromEnv !== undefined) return { url: trimTrailingSlashes(fromEnv), source: "env" };
  const fromFile = apiUrlSchema.safeParse(settings.apiUrl);
  if (fromFile.success) return { url: trimTrailingSlashes(fromFile.data), source: "file" };
  return { url: DEFAULT_API_URL, source: "default" };
}

export function readEnv(
  source: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  settings: Settings = {},
): CliEnv {
  const value = parse(source);
  const resolved = resolveApiUrl(source, settings);
  return {
    apiUrl: resolved.url,
    apiUrlSource: resolved.source,
    token: value.ANYNOTE_TOKEN,
    profile: value.ANYNOTE_PROFILE,
    configDir: value.ANYNOTE_CONFIG_DIR ?? defaultConfigDir(platform, source),
    forceJson: value.ANYNOTE_JSON === "1" || value.ANYNOTE_JSON === "true",
  };
}
