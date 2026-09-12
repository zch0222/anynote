import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultConfigDir, readEnv } from "../core/env";

describe("readEnv", () => {
  it("全缺省时给出本地网关与 default profile", () => {
    const env = readEnv({}, "linux");
    expect(env.apiUrl).toBe("http://localhost:8080");
    expect(env.profile).toBe("default");
    expect(env.token).toBeUndefined();
    expect(env.forceJson).toBe(false);
  });

  it("去掉 apiUrl 末尾斜杠", () => {
    expect(readEnv({ ANYNOTE_API_URL: "http://gw.test/" }, "linux").apiUrl).toBe("http://gw.test");
  });

  it("ANYNOTE_JSON=1 强制 JSON", () => {
    expect(readEnv({ ANYNOTE_JSON: "1" }, "linux").forceJson).toBe(true);
    expect(readEnv({ ANYNOTE_JSON: "true" }, "linux").forceJson).toBe(true);
    expect(readEnv({ ANYNOTE_JSON: "0" }, "linux").forceJson).toBe(false);
  });

  it("非法 URL 直接报错，不静默降级", () => {
    expect(() => readEnv({ ANYNOTE_API_URL: "不是 URL" }, "linux")).toThrow(/ANYNOTE_API_URL/);
  });

  it("透传 ANYNOTE_TOKEN 与 profile", () => {
    const env = readEnv({ ANYNOTE_TOKEN: "tok", ANYNOTE_PROFILE: "work" }, "linux");
    expect(env.token).toBe("tok");
    expect(env.profile).toBe("work");
  });

  it("ANYNOTE_CONFIG_DIR 覆盖默认目录", () => {
    expect(readEnv({ ANYNOTE_CONFIG_DIR: "/tmp/x" }, "linux").configDir).toBe("/tmp/x");
  });

  it("空字符串一律视为未设置", () => {
    // Windows / CI 常见写法：ANYNOTE_TOKEN="" 表示不要用环境变量里的 token
    const env = readEnv(
      { ANYNOTE_TOKEN: "", ANYNOTE_PROFILE: "", ANYNOTE_API_URL: "", ANYNOTE_CONFIG_DIR: "" },
      "linux",
    );
    expect(env.token).toBeUndefined();
    expect(env.profile).toBe("default");
    expect(env.apiUrl).toBe("http://localhost:8080");
  });
});

describe("defaultConfigDir", () => {
  it("Windows 用 APPDATA", () => {
    expect(defaultConfigDir("win32", { APPDATA: "C:\\Users\\a\\AppData\\Roaming" })).toBe(
      path.join("C:\\Users\\a\\AppData\\Roaming", "anynote"),
    );
  });

  it("其它平台用 ~/.anynote", () => {
    expect(defaultConfigDir("linux", {})).toBe(path.join(os.homedir(), ".anynote"));
  });

  it("Windows 缺 APPDATA 时回落到 home", () => {
    expect(defaultConfigDir("win32", {})).toBe(path.join(os.homedir(), ".anynote"));
  });
});
