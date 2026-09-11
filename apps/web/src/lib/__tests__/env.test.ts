import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DEPLOYMENT_ENV", undefined);
  vi.stubEnv("INTERNAL_API_URL", undefined);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", undefined);
  vi.stubEnv("COLLAB_TOKEN_SECRET", undefined);
  vi.stubEnv("NEXT_PUBLIC_COLLAB_WS_URL", undefined);
  vi.stubEnv("DESKTOP_EXCHANGE_KEY", undefined);
  vi.stubEnv("DESKTOP_ALLOWED_ORIGINS", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("服务端环境变量", () => {
  beforeEach(() => vi.stubGlobal("window", undefined));

  it("容器可在生产构建上显式声明开发部署", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOYMENT_ENV", "development");
    const { env } = await import("../env");
    expect(env.NODE_ENV).toBe("production");
    expect(env.DEPLOYMENT_ENV).toBe("development");
  });

  it("提供本地 Gateway 与浏览器源默认值", async () => {
    const { env } = await import("../env");
    expect(env).toEqual({
      NODE_ENV: "test",
      INTERNAL_API_URL: "http://localhost:8080",
      COLLAB_TOKEN_SECRET: "anynote-collab-dev-secret",
      DESKTOP_ALLOWED_ORIGINS: "tauri://localhost,http://tauri.localhost,https://tauri.localhost",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_COLLAB_WS_URL: "ws://localhost:1234",
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

  it("协同配置可被覆盖", async () => {
    vi.stubEnv("COLLAB_TOKEN_SECRET", "a-much-longer-production-secret");
    vi.stubEnv("NEXT_PUBLIC_COLLAB_WS_URL", "wss://notes.example.com/collab");
    const { env } = await import("../env");
    expect(env.COLLAB_TOKEN_SECRET).toBe("a-much-longer-production-secret");
    expect(env.NEXT_PUBLIC_COLLAB_WS_URL).toBe("wss://notes.example.com/collab");
  });

  it("桌面令牌交换默认关闭：不配 DESKTOP_EXCHANGE_KEY 就没有这个字段", async () => {
    const { env } = await import("../env");
    expect(env.DESKTOP_EXCHANGE_KEY).toBeUndefined();
  });

  it("桌面密钥过短时拒绝启动", async () => {
    vi.stubEnv("DESKTOP_EXCHANGE_KEY", "short");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../env")).rejects.toThrow("Invalid env vars");
  });

  it("协同密钥过短时拒绝启动（HMAC 强度不足）", async () => {
    vi.stubEnv("COLLAB_TOKEN_SECRET", "short");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../env")).rejects.toThrow("Invalid env vars");
  });

  it.each([
    "INTERNAL_API_URL",
    "NEXT_PUBLIC_APP_URL",
    "NODE_ENV",
    "DEPLOYMENT_ENV",
    "NEXT_PUBLIC_COLLAB_WS_URL",
  ])("%s 非法时拒绝启动并报告字段名", async (name) => {
    vi.stubEnv(name, "invalid");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../env")).rejects.toThrow("Invalid env vars");
    expect(error).toHaveBeenCalledWith(
      "❌ Invalid env vars:",
      expect.objectContaining({ [name]: expect.any(Array) }),
    );
  });
});

describe("浏览器环境变量", () => {
  it("只暴露公共配置，不读取或校验服务端地址", async () => {
    vi.stubEnv("INTERNAL_API_URL", "invalid-server-only-value");
    const { env } = await import("../env");
    expect(env).toEqual({
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_COLLAB_WS_URL: "ws://localhost:1234",
    });
    expect(env).not.toHaveProperty("INTERNAL_API_URL");
    expect(env).not.toHaveProperty("NODE_ENV");
    // 协同密钥与桌面交换密钥都是服务端机密，绝不能进浏览器包
    expect(env).not.toHaveProperty("COLLAB_TOKEN_SECRET");
    expect(env).not.toHaveProperty("DESKTOP_EXCHANGE_KEY");
  });

  it("公共地址非法时仍拒绝加载", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "invalid");
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(import("../env")).rejects.toThrow("Invalid env vars");
  });
});
