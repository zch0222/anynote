import { describe, expect, it } from "vitest";
import { browserCommand, openBrowser } from "../auth/browser";

describe("browserCommand", () => {
  it("三大平台各自给出打开命令", () => {
    expect(browserCommand("darwin", "https://x.test/a")).toEqual({
      command: "open",
      args: ["https://x.test/a"],
    });
    expect(browserCommand("linux", "https://x.test/a")).toEqual({
      command: "xdg-open",
      args: ["https://x.test/a"],
    });
    expect(browserCommand("win32", "https://x.test/a")).toEqual({
      command: "cmd",
      args: ["/c", "start", "", "https://x.test/a"],
    });
  });

  it("URL 原样作为单个参数传递，不经过 shell（授权链接带三个 & 参数）", () => {
    const url = "https://x.test/cli/authorize?port=1&state=a&challenge=b";
    for (const platform of ["darwin", "linux", "win32"]) {
      const target = browserCommand(platform, url);
      expect(target?.args.at(-1)).toBe(url);
      // 没有哪一段是把 URL 拼进 shell 命令字符串
      expect(target?.args.some((arg) => arg.includes("&&") || arg.startsWith("sh -c"))).toBe(false);
    }
  });

  it("未知平台返回 null，由调用方回落到打印链接", () => {
    expect(browserCommand("aix", "https://x.test")).toBeNull();
  });
});

describe("openBrowser", () => {
  it("未知平台直接返回 false，不抛错", async () => {
    await expect(openBrowser("https://x.test", "aix")).resolves.toBe(false);
  });

  it("命令不存在时返回 false 而不是崩掉（无头环境常见）", async () => {
    await expect(openBrowser("https://x.test", "linux-does-not-exist")).resolves.toBe(false);
  });
});
