import os from "node:os";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  /** Gateway 地址；CLI 直连 Gateway，不经 Next BFF */
  ANYNOTE_API_URL: z.string().url().default("http://localhost:8080"),
  /** 直接提供 accessToken：不落盘、不刷新，过期即 exit 3。CI / agent 沙箱用 */
  ANYNOTE_TOKEN: z.string().min(1).optional(),
  /** 凭据 profile 名 */
  ANYNOTE_PROFILE: z.string().min(1).default("default"),
  /** 凭据与配置目录 */
  ANYNOTE_CONFIG_DIR: z.string().min(1).optional(),
  /** 置 1 强制 JSON 输出（等价于 --json） */
  ANYNOTE_JSON: z.string().optional(),
});

export type CliEnv = {
  apiUrl: string;
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
 * 空字符串一律当作"没设置"。Windows 与 CI 里把变量置空是常见写法
 * （`ANYNOTE_TOKEN=""` 表示"不要用环境变量里的 token"），不能让它撞上 min(1) 校验。
 */
function dropEmpty(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
}

export function readEnv(
  source: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
): CliEnv {
  const parsed = schema.safeParse(dropEmpty(source));
  if (!parsed.success) {
    const fields = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
    throw new Error(`环境变量不合法：${fields}`);
  }
  const value = parsed.data;
  return {
    apiUrl: value.ANYNOTE_API_URL.replace(/\/+$/, ""),
    token: value.ANYNOTE_TOKEN,
    profile: value.ANYNOTE_PROFILE,
    configDir: value.ANYNOTE_CONFIG_DIR ?? defaultConfigDir(platform, source),
    forceJson: value.ANYNOTE_JSON === "1" || value.ANYNOTE_JSON === "true",
  };
}
