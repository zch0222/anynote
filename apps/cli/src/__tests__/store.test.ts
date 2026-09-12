import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialStore, type Profile } from "../auth/store";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-store-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  apiUrl: "http://gateway.test",
  accessToken: "at1",
  refreshToken: "rt1",
  username: "alice",
  obtainedAt: 1_700_000_000_000,
  ...overrides,
});

function makeStore(options: {
  refreshTokens?: (rt: string) => Promise<{ accessToken: string; refreshToken: string }>;
  envToken?: string;
  profileName?: string;
}) {
  return new CredentialStore({
    configDir: dir,
    profile: options.profileName ?? "default",
    ...(options.envToken ? { envToken: options.envToken } : {}),
    now: () => 1_700_000_000_001,
    refreshTokens:
      options.refreshTokens ?? (async () => ({ accessToken: "at2", refreshToken: "rt2" })),
    lockOptions: { timeoutMs: 200, pollMs: 1 },
  });
}

describe("凭据读写", () => {
  it("落盘后能读回来", async () => {
    const store = makeStore({});
    await store.saveProfile(profile());
    await expect(store.readProfile()).resolves.toMatchObject({ accessToken: "at1" });
  });

  it("文件不存在时当作没有凭据", async () => {
    await expect(makeStore({}).readProfile()).resolves.toBeNull();
  });

  it("文件损坏时不抛错，降级成没有凭据", async () => {
    await fs.writeFile(path.join(dir, "credentials.json"), "{坏掉的 JSON", "utf8");
    await expect(makeStore({}).readProfile()).resolves.toBeNull();
  });

  it("多 profile 互不干扰", async () => {
    await makeStore({ profileName: "default" }).saveProfile(profile({ username: "alice" }));
    await makeStore({ profileName: "work" }).saveProfile(
      profile({ username: "bob", accessToken: "at-work" }),
    );
    await expect(makeStore({ profileName: "default" }).readProfile()).resolves.toMatchObject({
      username: "alice",
    });
    await expect(makeStore({ profileName: "work" }).readProfile()).resolves.toMatchObject({
      username: "bob",
      accessToken: "at-work",
    });
  });

  it("删除 profile 不影响其它 profile", async () => {
    await makeStore({ profileName: "default" }).saveProfile(profile());
    await makeStore({ profileName: "work" }).saveProfile(profile({ username: "bob" }));
    await makeStore({ profileName: "default" }).removeProfile();
    await expect(makeStore({ profileName: "default" }).readProfile()).resolves.toBeNull();
    await expect(makeStore({ profileName: "work" }).readProfile()).resolves.not.toBeNull();
  });

  it("写入是原子的：不留下临时文件", async () => {
    const store = makeStore({});
    await store.saveProfile(profile());
    const entries = await fs.readdir(dir);
    expect(entries.filter((name) => name.endsWith(".tmp"))).toHaveLength(0);
  });
});

describe("accessToken 优先级", () => {
  it("环境变量优先于落盘 profile", async () => {
    const store = makeStore({ envToken: "env-token" });
    await store.saveProfile(profile());
    await expect(store.accessToken()).resolves.toBe("env-token");
    expect(store.usesEnvToken).toBe(true);
  });

  it("没有任何凭据时抛用法错误", async () => {
    await expect(makeStore({}).accessToken()).rejects.toMatchObject({ name: "UsageError" });
  });
});

describe("刷新", () => {
  it("刷新成功后落盘新 token", async () => {
    const store = makeStore({});
    await store.saveProfile(profile());
    await expect(store.refresh()).resolves.toEqual({ accessToken: "at2", refreshToken: "rt2" });
    await expect(store.readProfile()).resolves.toMatchObject({
      accessToken: "at2",
      refreshToken: "rt2",
      obtainedAt: 1_700_000_000_001,
      username: "alice",
    });
  });

  it("使用环境变量 token 时不刷新", async () => {
    const refreshTokens = vi.fn();
    const store = makeStore({ envToken: "env-token", refreshTokens });
    await expect(store.refresh()).resolves.toBeNull();
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("没有 refreshToken 时直接返回 null", async () => {
    const refreshTokens = vi.fn();
    const store = makeStore({ refreshTokens });
    await expect(store.refresh()).resolves.toBeNull();
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  it("并发刷新只打一次后端，其余复用结果", async () => {
    // 后端会轮换 refreshToken：两个进程各刷一次的话，后到的那个会拿作废的 rt，两边都被登出
    const refreshTokens = vi.fn(async (rt: string) => {
      expect(rt).toBe("rt1");
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { accessToken: "at2", refreshToken: "rt2" };
    });
    await makeStore({}).saveProfile(profile());
    const stores = [
      makeStore({ refreshTokens }),
      makeStore({ refreshTokens }),
      makeStore({ refreshTokens }),
    ];
    const results = await Promise.all(stores.map((store) => store.refresh()));

    expect(refreshTokens).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toEqual({ accessToken: "at2", refreshToken: "rt2" });
    }
  });

  it("等锁超时后重读到别人刷好的新 token", async () => {
    const writer = makeStore({});
    await writer.saveProfile(profile());

    // 锁被别人占住：owner.json 是刚写的，不会被当成陈旧锁抢占
    await fs.mkdir(path.join(dir, ".refresh.lock"), { recursive: true });
    await fs.writeFile(
      path.join(dir, ".refresh.lock", "owner.json"),
      JSON.stringify({ pid: 1, acquiredAt: Date.now() }),
      "utf8",
    );

    let rotated = false;
    const blocked = new CredentialStore({
      configDir: dir,
      profile: "default",
      now: () => 1_700_000_000_002,
      refreshTokens: async () => {
        throw new Error("等锁的进程不应该自己发起刷新");
      },
      lockOptions: {
        timeoutMs: 40,
        pollMs: 5,
        staleMs: 10_000,
        // 等锁期间持锁进程完成了刷新
        sleep: async () => {
          if (rotated) return;
          rotated = true;
          await writer.saveProfile(
            profile({ accessToken: "at-by-other", refreshToken: "rt-by-other" }),
          );
        },
      },
    });

    await expect(blocked.refresh()).resolves.toEqual({
      accessToken: "at-by-other",
      refreshToken: "rt-by-other",
    });
  });
});
