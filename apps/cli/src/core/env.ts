import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { Settings } from "./settings";

const apiUrlSchema = z.string().url();

const schema = z.object({
  /** Gateway 地址；CLI 直连 Gateway，不经 Next BFF */
  ANYNOTE_API_URL: apiUrlSchema.optional(),
  /** 浏览器授权登录时打开的 Web 前端地址；`auth login` 默认走这条路 */
  ANYNOTE_WEB_URL: apiUrlSchema.optional(),
  /** 直接提供 accessToken：不落盘、不刷新，过期即 exit 3。CI / agent 沙箱用 */
  ANYNOTE_TOKEN: z.string().min(1).optional(),
  /** 凭据 profile 名 */
  ANYNOTE_PROFILE: z.string().min(1).default("default"),
  /** 凭据与配置目录 */
  ANYNOTE_CONFIG_DIR: z.string().min(1).optional(),
  /** 置 1 强制 JSON 输出（等价于 --json） */
  ANYNOTE_JSON: z.string().optional(),
  /**
   * 置 0 禁止 `auth login` 自动拉起浏览器（只打印授权链接）。
   * 无桌面环境的服务器上避免 spawn 失败噪声；端到端测试也靠它不弹窗。
   */
  ANYNOTE_OPEN_BROWSER: z.string().optional(),
});

export const DEFAULT_API_URL = "http://localhost:8080";

/** 默认 Web 前端地址，与 `infra/docker-compose.yaml` 的 `NEXT_PUBLIC_APP_URL` 默认值对齐。 */
export const DEFAULT_WEB_URL = "http://localhost:3000";

export type CliEnv = {
  apiUrl: string;
  /** apiUrl 的来源：环境变量 / 设置文件 / 内置默认值，供 doctor 与 config path 展示 */
  apiUrlSource: "env" | "file" | "default";
  /** 浏览器授权登录跳转的 Web 前端地址 */
  webUrl: string;
  /** webUrl 的来源，与 apiUrlSource 同构；两者常指向不同站点，必须各自可辨 */
  webUrlSource: "env" | "file" | "default";
  token: string | undefined;
  profile: string;
  configDir: string;
  forceJson: boolean;
  /** 是否允许 `auth login` 自动打开浏览器 */
  openBrowser: boolean;
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

/**
 * Web 前端地址的优先级与 {@link resolveApiUrl} 同构：
 * `ANYNOTE_WEB_URL` > 设置文件 > 默认值。
 *
 * 生产部署里授权页与网关**通常不同域**（例如前站在 `notes.example.com`、网关在
 * `api.example.com`），所以这两项必须各自独立解析——早先 webUrl 只认环境变量，
 * 用户 `config set api-url` 之后 `auth login` 仍然打开 localhost:3000，正是这个原因。
 */
export function resolveWebUrl(
  env: NodeJS.ProcessEnv,
  settings: Settings,
): { url: string; source: "env" | "file" | "default" } {
  const fromEnv = parse(env).ANYNOTE_WEB_URL;
  if (fromEnv !== undefined) return { url: trimTrailingSlashes(fromEnv), source: "env" };
  const fromFile = apiUrlSchema.safeParse(settings.webUrl);
  if (fromFile.success) return { url: trimTrailingSlashes(fromFile.data), source: "file" };
  return { url: DEFAULT_WEB_URL, source: "default" };
}

export function readEnv(
  source: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  settings: Settings = {},
): CliEnv {
  const value = parse(source);
  const resolved = resolveApiUrl(source, settings);
  const resolvedWeb = resolveWebUrl(source, settings);
  return {
    apiUrl: resolved.url,
    apiUrlSource: resolved.source,
    webUrl: resolvedWeb.url,
    webUrlSource: resolvedWeb.source,
    token: value.ANYNOTE_TOKEN,
    profile: value.ANYNOTE_PROFILE,
    configDir: value.ANYNOTE_CONFIG_DIR ?? defaultConfigDir(platform, source),
    forceJson: value.ANYNOTE_JSON === "1" || value.ANYNOTE_JSON === "true",
    // 默认允许开浏览器；显式置 0 / false 才关掉。
    openBrowser: value.ANYNOTE_OPEN_BROWSER !== "0" && value.ANYNOTE_OPEN_BROWSER !== "false",
  };
}
