import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock } from "../auth/lock";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-lock-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const lockPath = () => path.join(dir, ".refresh.lock");

describe("acquireLock", () => {
  it("首个调用拿到锁，释放后目录消失", async () => {
    const lock = await acquireLock(lockPath());
    expect(lock).not.toBeNull();
    await expect(fs.stat(lockPath())).resolves.toBeTruthy();
    await lock?.release();
    await expect(fs.stat(lockPath())).rejects.toThrow();
  });

  it("并发获取只有一个成功", async () => {
    const options = { timeoutMs: 0, pollMs: 1 };
    const results = await Promise.all([
      acquireLock(lockPath(), options),
      acquireLock(lockPath(), options),
      acquireLock(lockPath(), options),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("等锁超时返回 null 而不是抛错", async () => {
    const held = await acquireLock(lockPath());
    const second = await acquireLock(lockPath(), { timeoutMs: 30, pollMs: 5 });
    expect(second).toBeNull();
    await held?.release();
  });

  it("陈旧锁可以被抢占", async () => {
    const held = await acquireLock(lockPath());
    expect(held).not.toBeNull();
    // 时钟往前推到超过 staleMs
    const later = Date.now() + 60_000;
    const taken = await acquireLock(lockPath(), {
      staleMs: 10_000,
      timeoutMs: 100,
      pollMs: 1,
      now: () => later,
    });
    expect(taken).not.toBeNull();
    await taken?.release();
  });

  it("owner.json 损坏时按目录时间判断陈旧", async () => {
    await fs.mkdir(lockPath());
    await fs.writeFile(path.join(lockPath(), "owner.json"), "{不是 JSON", "utf8");
    const taken = await acquireLock(lockPath(), {
      staleMs: 0,
      timeoutMs: 100,
      pollMs: 1,
      now: () => Date.now() + 1_000,
    });
    expect(taken).not.toBeNull();
    await taken?.release();
  });
});
