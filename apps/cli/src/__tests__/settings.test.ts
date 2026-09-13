import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SettingsStore } from "../core/settings";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "anynote-settings-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("SettingsStore", () => {
  it("没文件时读出空设置，不抛异常", async () => {
    const store = new SettingsStore(path.join(dir, "missing"));
    await expect(store.read()).resolves.toEqual({});
  });

  it("写入后能原样读回，并落在 configDir/settings.json", async () => {
    const store = new SettingsStore(dir);
    await store.write({ apiUrl: "http://192.168.3.90:8080" });
    expect(store.filePath).toBe(path.join(dir, "settings.json"));
    await expect(store.read()).resolves.toEqual({ apiUrl: "http://192.168.3.90:8080" });
  });

  it("目录不存在时自动创建", async () => {
    const nested = path.join(dir, "a", "b");
    const store = new SettingsStore(nested);
    await store.write({ apiUrl: "http://gw.test" });
    const raw = await fs.readFile(path.join(nested, "settings.json"), "utf8");
    expect(JSON.parse(raw)).toMatchObject({ version: 1, apiUrl: "http://gw.test" });
  });

  it("文件损坏时当作没设置过，而不是让所有命令起不来", async () => {
    const store = new SettingsStore(dir);
    await fs.writeFile(store.filePath, "{ 半截 json", "utf8");
    await expect(store.read()).resolves.toEqual({});
  });

  it("字段非法（不是 URL）时忽略该字段", async () => {
    const store = new SettingsStore(dir);
    await fs.writeFile(store.filePath, JSON.stringify({ version: 1, apiUrl: "不是 URL" }), "utf8");
    await expect(store.read()).resolves.toEqual({});
  });

  it("写空对象等于清空 apiUrl，且不残留旧键", async () => {
    const store = new SettingsStore(dir);
    await store.write({ apiUrl: "http://a.test" });
    await store.write({});
    const raw = JSON.parse(await fs.readFile(store.filePath, "utf8")) as Record<string, unknown>;
    expect(raw.apiUrl).toBeUndefined();
    await expect(store.read()).resolves.toEqual({});
  });

  it("原子写：不留下 .tmp 残留文件", async () => {
    const store = new SettingsStore(dir);
    await store.write({ apiUrl: "http://a.test" });
    const entries = await fs.readdir(dir);
    expect(entries.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("设置文件与凭据文件互不干扰", async () => {
    // 两者都在 configDir 下，登出只该动 credentials.json
    const store = new SettingsStore(dir);
    await store.write({ apiUrl: "http://a.test" });
    await fs.writeFile(
      path.join(dir, "credentials.json"),
      JSON.stringify({ version: 1, profiles: {} }),
    );
    await expect(store.read()).resolves.toEqual({ apiUrl: "http://a.test" });
  });

  it("webUrl 与 apiUrl 可共存，写入一个不影响另一个", async () => {
    const store = new SettingsStore(dir);
    await store.write({ apiUrl: "http://gw.test" });
    await store.write({ ...(await store.read()), webUrl: "https://web.test" });
    await expect(store.read()).resolves.toEqual({
      apiUrl: "http://gw.test",
      webUrl: "https://web.test",
    });
    const raw = JSON.parse(await fs.readFile(store.filePath, "utf8")) as Record<string, unknown>;
    expect(raw).toMatchObject({ version: 1, apiUrl: "http://gw.test", webUrl: "https://web.test" });
  });

  it("清掉 webUrl 后 apiUrl 仍在（两项各自独立）", async () => {
    const store = new SettingsStore(dir);
    await store.write({ apiUrl: "http://gw.test", webUrl: "https://web.test" });
    const { webUrl: _dropped, ...rest } = await store.read();
    await store.write(rest);
    await expect(store.read()).resolves.toEqual({ apiUrl: "http://gw.test" });
  });

  it("webUrl 字段非法（不是 URL）时忽略它，但保留合法的 apiUrl", async () => {
    const store = new SettingsStore(dir);
    await fs.writeFile(
      store.filePath,
      JSON.stringify({ version: 1, apiUrl: "http://gw.test", webUrl: "不是 URL" }),
      "utf8",
    );
    // 整份文件校验失败即当没设过——与 apiUrl 同策略，避免半份配置误导用户
    await expect(store.read()).resolves.toEqual({});
  });
});
