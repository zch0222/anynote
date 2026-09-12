import fs from "node:fs/promises";
import path from "node:path";

export type Lock = { release: () => Promise<void> };

export type LockOptions = {
  /** 等锁总时长；超时返回 null，调用方应改为重读凭据 */
  timeoutMs?: number;
  /** 超过这个年龄的锁视为持有者已崩溃，可以抢占 */
  staleMs?: number;
  pollMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const OWNER_FILE = "owner.json";

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function ownerAge(lockDir: string, now: number): Promise<number> {
  try {
    const raw = await fs.readFile(path.join(lockDir, OWNER_FILE), "utf8");
    const acquiredAt = Number(JSON.parse(raw).acquiredAt);
    if (Number.isFinite(acquiredAt)) return now - acquiredAt;
  } catch {
    // owner.json 缺失或损坏：退化成看目录本身的创建时间
  }
  try {
    const stat = await fs.stat(lockDir);
    return now - stat.mtimeMs;
  } catch {
    // 目录刚好被别人释放了，当成"没有锁"
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * 基于 `mkdir` 原子性的跨进程锁（Windows / POSIX 行为一致）。
 *
 * 多个 agent 并发跑 CLI 是常态，token 刷新必须串行：后端会轮换 refreshToken，
 * 两个进程拿同一个旧 rt 去刷，后到的那个会拿着已作废的 rt 请求，结果两边都被登出。
 */
export async function acquireLock(
  lockDir: string,
  options: LockOptions = {},
): Promise<Lock | null> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const staleMs = options.staleMs ?? 10_000;
  const pollMs = options.pollMs ?? 50;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = now() + timeoutMs;

  for (;;) {
    try {
      await fs.mkdir(lockDir, { recursive: false });
      await fs.writeFile(
        path.join(lockDir, OWNER_FILE),
        JSON.stringify({ pid: process.pid, acquiredAt: now() }),
        "utf8",
      );
      return {
        release: async () => {
          await fs.rm(lockDir, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }

    if ((await ownerAge(lockDir, now())) > staleMs) {
      // 抢占陈旧锁；删除失败说明别人刚好也在抢，下一轮重试即可
      await fs.rm(lockDir, { recursive: true, force: true }).catch(() => undefined);
      continue;
    }

    if (now() >= deadline) return null;
    await sleep(pollMs);
  }
}
