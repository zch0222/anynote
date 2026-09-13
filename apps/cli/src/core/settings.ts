import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * CLI 的**持久化设置**（`<configDir>/settings.json`）。
 *
 * ⚠️ 这里只放**非敏感**配置。token 一律归 `auth/store.ts` 的 credentials.json 管，
 * 两份文件不能互相抄字段——否则「登出清凭据」就会顺手抹掉用户的网关地址。
 */
export type Settings = {
  /** 持久化的网关地址；未设置时由 readEnv 落到默认值 */
  apiUrl?: string;
};

const schema = z.object({
  version: z.literal(1).optional(),
  apiUrl: z.string().url().optional(),
});

function emptySettings(): Settings {
  return {};
}

/**
 * 设置存储。与凭据存储同样的"临时文件 + rename"原子写，
 * 只是**不设 0600**：这里没有秘密，逐 profile 共享反而更方便。
 */
export class SettingsStore {
  readonly filePath: string;
  private readonly configDir: string;

  constructor(configDir: string) {
    this.configDir = configDir;
    this.filePath = path.join(configDir, "settings.json");
  }

  /** 读不到 / 解析失败 / 字段非法一律当作"没设过"，让调用方回落默认值。 */
  async read(): Promise<Settings> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = schema.safeParse(JSON.parse(raw));
      if (!parsed.success) return emptySettings();
      return parsed.data.apiUrl === undefined ? {} : { apiUrl: parsed.data.apiUrl };
    } catch {
      return emptySettings();
    }
  }

  async write(settings: Settings): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
    const payload = {
      version: 1 as const,
      ...(settings.apiUrl !== undefined ? { apiUrl: settings.apiUrl } : {}),
    };
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await fs.rename(tmp, this.filePath);
  }
}
