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

  it("ANYNOTE_WEB_URL 缺省回落到本地前端地址，并可覆盖", () => {
    expect(readEnv({}, "linux").webUrl).toBe("http://localhost:3000");
    expect(readEnv({ ANYNOTE_WEB_URL: "https://notes.example.com/" }, "linux").webUrl).toBe(
      "https://notes.example.com",
    );
    expect(readEnv({}, "linux").webUrlSource).toBe("default");
    expect(readEnv({ ANYNOTE_WEB_URL: "https://notes.example.com" }, "linux").webUrlSource).toBe(
      "env",
    );
  });

  it("设置文件里的 webUrl 在没有环境变量时生效（授权页与网关常不同域，必须能落盘）", () => {
    const settings = { webUrl: "https://notes.example.com/" };
    const env = readEnv({}, "linux", settings);
    expect(env.webUrl).toBe("https://notes.example.com");
    expect(env.webUrlSource).toBe("file");
  });

  it("ANYNOTE_WEB_URL 优先级高于设置文件里的 webUrl", () => {
    const settings = { webUrl: "https://from-file.test" };
    const env = readEnv({ ANYNOTE_WEB_URL: "https://from-env.test" }, "linux", settings);
    expect(env.webUrl).toBe("https://from-env.test");
    expect(env.webUrlSource).toBe("env");
  });

  it("设置文件里的 webUrl 非法时回落默认值，不让所有命令起不来", () => {
    const env = readEnv({}, "linux", { webUrl: "不是 URL" });
    expect(env.webUrl).toBe("http://localhost:3000");
    expect(env.webUrlSource).toBe("default");
  });

  it("webUrl 与 apiUrl 各自独立解析，互不覆盖", () => {
    const env = readEnv({ ANYNOTE_API_URL: "https://api.test" }, "linux", {
      webUrl: "https://web.test",
    });
    expect(env.apiUrl).toBe("https://api.test");
    expect(env.apiUrlSource).toBe("env");
    expect(env.webUrl).toBe("https://web.test");
    expect(env.webUrlSource).toBe("file");
  });

  it("ANYNOTE_OPEN_BROWSER 默认开启，只有显式 0 / false 才关闭", () => {
    expect(readEnv({}, "linux").openBrowser).toBe(true);
    expect(readEnv({ ANYNOTE_OPEN_BROWSER: "1" }, "linux").openBrowser).toBe(true);
    expect(readEnv({ ANYNOTE_OPEN_BROWSER: "0" }, "linux").openBrowser).toBe(false);
    expect(readEnv({ ANYNOTE_OPEN_BROWSER: "false" }, "linux").openBrowser).toBe(false);
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
