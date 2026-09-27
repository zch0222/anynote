import { describe, expect, it } from "vitest";
import { readConfig } from "../config.ts";

const secret = "a-very-long-dev-secret";

describe("readConfig", () => {
  it("缺省时给出可直接启动的默认值", () => {
    expect(readConfig({ COLLAB_TOKEN_SECRET: secret })).toEqual({
      host: "0.0.0.0",
      port: 1234,
      tokenSecret: secret,
      persistenceDir: null,
      allowedOrigins: [],
      serverPersist: false,
      noteServiceUrl: null,
      internalSecret: null,
      storeDebounceMs: 2_000,
      storeMaxDebounceMs: 10_000,
      redisUrl: null,
    });
  });

  it("按环境变量覆盖 host / port / 持久化目录", () => {
    const config = readConfig({
      COLLAB_TOKEN_SECRET: secret,
      COLLAB_HOST: "127.0.0.1",
      COLLAB_PORT: "4321",
      COLLAB_PERSISTENCE_DIR: "/data/collab",
    });
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4321);
    expect(config.persistenceDir).toBe("/data/collab");
  });

  it("允许来源按逗号切分并去掉空白项", () => {
    const config = readConfig({
      COLLAB_TOKEN_SECRET: secret,
      COLLAB_ALLOWED_ORIGINS: " http://localhost:3000 , ,https://app.example.com ",
    });
    expect(config.allowedOrigins).toEqual(["http://localhost:3000", "https://app.example.com"]);
  });

  it("空白的持久化目录视为未配置", () => {
    expect(
      readConfig({ COLLAB_TOKEN_SECRET: secret, COLLAB_PERSISTENCE_DIR: "   " }).persistenceDir,
    ).toBeNull();
  });

  it("密钥缺失或过短时拒绝启动", () => {
    expect(() => readConfig({})).toThrow(/COLLAB_TOKEN_SECRET/);
    expect(() => readConfig({ COLLAB_TOKEN_SECRET: "short" })).toThrow(/COLLAB_TOKEN_SECRET/);
    expect(() => readConfig({ COLLAB_TOKEN_SECRET: "               " })).toThrow(
      /COLLAB_TOKEN_SECRET/,
    );
  });

  it("端口非法时拒绝启动", () => {
    for (const port of ["0", "70000", "abc", "-1", "8080.5"]) {
      expect(() => readConfig({ COLLAB_TOKEN_SECRET: secret, COLLAB_PORT: port })).toThrow(
        /COLLAB_PORT/,
      );
    }
  });

  it("端口为空串时退回默认端口", () => {
    expect(readConfig({ COLLAB_TOKEN_SECRET: secret, COLLAB_PORT: "  " }).port).toBe(1234);
  });

  describe("服务端落库（COLLAB_SERVER_PERSIST）", () => {
    const persist = {
      COLLAB_TOKEN_SECRET: secret,
      COLLAB_SERVER_PERSIST: "true",
      NOTE_SERVICE_URL: "http://anynote-modules-note:18091",
      ANYNOTE_INTERNAL_SECRET: "internal-secret-0123456789",
    };

    it("打开开关且依赖齐全时读出落库配置", () => {
      const config = readConfig({
        ...persist,
        COLLAB_STORE_DEBOUNCE_MS: "1500",
        COLLAB_STORE_MAX_DEBOUNCE_MS: "8000",
        COLLAB_REDIS_URL: "redis://redis:6379",
      });
      expect(config).toMatchObject({
        serverPersist: true,
        noteServiceUrl: "http://anynote-modules-note:18091",
        internalSecret: "internal-secret-0123456789",
        storeDebounceMs: 1500,
        storeMaxDebounceMs: 8000,
        redisUrl: "redis://redis:6379",
      });
    });

    it("开关接受 true / 1，其余一律视为关闭", () => {
      expect(readConfig({ ...persist, COLLAB_SERVER_PERSIST: "1" }).serverPersist).toBe(true);
      expect(readConfig({ ...persist, COLLAB_SERVER_PERSIST: "yes" }).serverPersist).toBe(false);
    });

    it("缺少 note 服务地址时拒绝启动", () => {
      expect(() => readConfig({ ...persist, NOTE_SERVICE_URL: "" })).toThrow(/NOTE_SERVICE_URL/);
    });

    it("内部密钥缺失或太短时拒绝启动", () => {
      expect(() => readConfig({ ...persist, ANYNOTE_INTERNAL_SECRET: undefined })).toThrow(
        /ANYNOTE_INTERNAL_SECRET/,
      );
      expect(() => readConfig({ ...persist, ANYNOTE_INTERNAL_SECRET: "short" })).toThrow(
        /ANYNOTE_INTERNAL_SECRET/,
      );
    });

    it("开关关闭时不要求 note 服务地址与内部密钥", () => {
      expect(() => readConfig({ COLLAB_TOKEN_SECRET: secret })).not.toThrow();
    });

    it("防抖参数非法或最长等待小于防抖时拒绝启动", () => {
      expect(() => readConfig({ ...persist, COLLAB_STORE_DEBOUNCE_MS: "abc" })).toThrow(
        /COLLAB_STORE_DEBOUNCE_MS/,
      );
      expect(() =>
        readConfig({
          ...persist,
          COLLAB_STORE_DEBOUNCE_MS: "5000",
          COLLAB_STORE_MAX_DEBOUNCE_MS: "3000",
        }),
      ).toThrow(/COLLAB_STORE_MAX_DEBOUNCE_MS/);
    });
  });
});
