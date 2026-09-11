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
});
