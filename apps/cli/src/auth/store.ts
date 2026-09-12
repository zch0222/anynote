import fs from "node:fs/promises";
import path from "node:path";
import { UsageError } from "../core/exit";
import { type LockOptions, acquireLock } from "./lock";

export type TokenPair = { accessToken: string; refreshToken: string };

export type Profile = {
  apiUrl: string;
  accessToken: string;
  refreshToken: string;
  username?: string;
  obtainedAt: number;
};

export type CredentialsFile = {
  version: 1;
  current: string;
  profiles: Record<string, Profile>;
};

export type CredentialStoreDeps = {
  configDir: string;
  profile: string;
  /** ANYNOTE_TOKEN：不落盘、不刷新 */
  envToken?: string | undefined;
  now: () => number;
  refreshTokens: (refreshToken: string) => Promise<TokenPair>;
  lockOptions?: LockOptions;
};

/**
 * 每次都必须新建对象：返回共享常量的话，`{...EMPTY}` 只是浅拷贝，
 * `profiles` 仍指向同一个对象，saveProfile 会把内容写进"空凭据"模板里。
 */
function emptyFile(): CredentialsFile {
  return { version: 1, current: "default", profiles: {} };
}

/**
 * 凭据存储。
 *
 * ⚠️ token 以明文落盘（POSIX 下 0600，**Windows 上没有等价保护**）。这是 CLI 相对
 * 浏览器端 httpOnly Cookie 的已知弱化，理由与边界见
 * `.claude/openspec/changes/2026-09-12-cli-credential-storage.md`。
 * 不想落盘就用 `ANYNOTE_TOKEN` 环境变量。
 */
export class CredentialStore {
  readonly filePath: string;
  readonly lockPath: string;
  private readonly deps: CredentialStoreDeps;

  constructor(deps: CredentialStoreDeps) {
    this.deps = deps;
    this.filePath = path.join(deps.configDir, "credentials.json");
    this.lockPath = path.join(deps.configDir, ".refresh.lock");
  }

  get profileName(): string {
    return this.deps.profile;
  }

  /** 是否使用环境变量提供的临时 token（此时一切写盘与刷新都被跳过）。 */
  get usesEnvToken(): boolean {
    return Boolean(this.deps.envToken);
  }

  async readFile(): Promise<CredentialsFile> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as CredentialsFile;
      if (!parsed || typeof parsed !== "object" || !parsed.profiles) return emptyFile();
      return parsed;
    } catch {
      // 不存在 / 损坏都当作"没有凭据"，让调用方走登录流程
      return emptyFile();
    }
  }

  async readProfile(): Promise<Profile | null> {
    const file = await this.readFile();
    return file.profiles[this.deps.profile] ?? null;
  }

  /** 原子写：先写临时文件再 rename，避免并发写出半截 JSON。 */
  async saveProfile(profile: Profile): Promise<void> {
    const file = await this.readFile();
    file.version = 1;
    file.current = this.deps.profile;
    file.profiles[this.deps.profile] = profile;
    await fs.mkdir(this.deps.configDir, { recursive: true });
    await fs.chmod(this.deps.configDir, 0o700).catch(() => undefined);
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(tmp, this.filePath);
    await fs.chmod(this.filePath, 0o600).catch(() => undefined);
  }

  async removeProfile(): Promise<void> {
    const file = await this.readFile();
    delete file.profiles[this.deps.profile];
    await fs.mkdir(this.deps.configDir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, `${JSON.stringify(file, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(tmp, this.filePath);
  }

  /** 当前可用的 accessToken：环境变量优先，其次 profile。 */
  async accessToken(): Promise<string> {
    if (this.deps.envToken) return this.deps.envToken;
    const profile = await this.readProfile();
    if (!profile?.accessToken) {
      throw new UsageError(
        `profile「${this.deps.profile}」没有凭据，先执行 anynote auth login，或设置 ANYNOTE_TOKEN`,
      );
    }
    return profile.accessToken;
  }

  /**
   * 刷新 token。协议见 docs/cli/CLI_PLAN.md §7.5，两条硬规则：
   * 1. 拿锁前后都要重读凭据文件——别人刷过了就直接用别人的；
   * 2. 先落盘、再释放锁。
   */
  async refresh(): Promise<TokenPair | null> {
    if (this.deps.envToken) return null;
    const before = await this.readProfile();
    if (!before?.refreshToken) return null;

    const lock = await acquireLock(this.lockPath, this.deps.lockOptions);
    if (!lock) {
      const after = await this.readProfile();
      return after && after.accessToken !== before.accessToken
        ? { accessToken: after.accessToken, refreshToken: after.refreshToken }
        : null;
    }

    try {
      const latest = await this.readProfile();
      if (latest && latest.accessToken !== before.accessToken) {
        return { accessToken: latest.accessToken, refreshToken: latest.refreshToken };
      }
      const current = latest ?? before;
      const pair = await this.deps.refreshTokens(current.refreshToken);
      await this.saveProfile({ ...current, ...pair, obtainedAt: this.deps.now() });
      return pair;
    } finally {
      await lock.release();
    }
  }
}
