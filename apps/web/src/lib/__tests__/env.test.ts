import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("INTERNAL_API_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("服务端环境变量", () => {
  beforeEach(() => vi.stubGlobal("window", undefined));

  it("提供本地 Gateway 与浏览器源默认值", async () => {
    const { env } = await import("../env");
    expect(env).toEqual({
      NODE_ENV: "test",
      INTERNAL_API_URL: "http://localhost:8080",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });
  });

  it("读取 INTERNAL_API_URL，不再使用旧 BACKEND_URL", async () => {
    vi.stubEnv("INTERNAL_API_URL", "http://gateway:8080");
    vi.stubEnv("BACKEND_URL", "http://obsolete:8080");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://notes.example.com");
    const { env } = await import("../env");
    expect(env.INTERNAL_API_URL).toBe("http://gateway:8080");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://notes.example.com");
    expect(env).not.toHaveProperty("BACKEND_URL");
  });

  it("只配置旧变量时使用新变量的默认值", async () => {
    vi.stubEnv("BACKEND_URL", "http://obsolete:8080");
    const { env } = await import("../env");
    expect(env.INTERNAL_API_URL).toBe("http://localhost:8080");
  });

  it.each(["INTERNAL_API_URL", "NEXT_PUBLIC_APP_URL", "NODE_ENV"])(
    "%s 非法时拒绝启动并报告字段名",
    async (name) => {
      vi.stubEnv(name, "invalid");
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      await expect(import("../env")).rejects.toThrow("Invalid env vars");
      expect(error).toHaveBeenCalledWith(
        "❌ Invalid env vars:",
        expect.objectContaining({ [name]: expect.any(Array) }),
      );
    },
  );
});

describe("浏览器环境变量", () => {
  it("只暴露公共配置，不读取或校验服务端地址", async () => {
    vi.stubEnv("INTERNAL_API_URL", "invalid-server-only-value");
    const { env } = await import("../env");
    expect(env).toEqual({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
    expect(env).not.toHaveProperty("INTERNAL_API_URL");
    expect(env).not.toHaveProperty("NODE_ENV");
  });

  it("公共地址非法时仍拒绝加载", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "invalid");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../env")).rejects.toThrow("Invalid env vars");
  });
});
