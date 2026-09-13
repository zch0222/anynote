import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectInstallMode, isSelfContained } from "../core/install-mode";

describe("detectInstallMode", () => {
  it("识别全局安装的包（scoped）", () => {
    const p = path.join("/usr/lib/node_modules", "@anynote", "cli", "anynote.mjs");
    expect(detectInstallMode(p)).toBe("global");
  });

  it("识别全局安装的包（unscoped，改包名后仍认）", () => {
    const p = path.join("/home/a/.nvm/versions/node/v22/lib/node_modules", "anynote-cli", "anynote.mjs");
    expect(detectInstallMode(p)).toBe("global");
  });

  it("识别 Windows 下 nvm 全局目录（反斜杠同样适用）", () => {
    const p = "C:\\Users\\a\\AppData\\Local\\nvm\\v22\\node_modules\\@anynote\\cli\\anynote.mjs";
    expect(detectInstallMode(p)).toBe("global");
  });

  it("识别仓库内构建产物", () => {
    const p = path.join("/repo", "apps", "cli", "dist", "anynote.mjs");
    expect(detectInstallMode(p)).toBe("repo");
  });

  it("Windows 仓库路径也识别为 repo", () => {
    expect(detectInstallMode("C:\\code\\anynote\\apps\\cli\\dist\\anynote.mjs")).toBe("repo");
  });

  it("其它位置归为 unknown（例如手动拷走的单文件）", () => {
    expect(detectInstallMode(path.join("/opt", "tools", "anynote.mjs"))).toBe("unknown");
    expect(detectInstallMode("")).toBe("unknown");
  });

  it("node_modules 但不是本包，不算 global", () => {
    expect(detectInstallMode(path.join("/repo", "node_modules", "zod", "index.js"))).toBe("unknown");
  });
});

describe("isSelfContained", () => {
  it("只有仓库产物算依赖项目目录", () => {
    // global 是真正"删掉仓库也能跑"的形态；unknown 至少不依赖本项目目录
    expect(isSelfContained("global")).toBe(true);
    expect(isSelfContained("unknown")).toBe(true);
    expect(isSelfContained("repo")).toBe(false);
  });
});
