import { normalizeLanguage } from "@/lib/editor/shiki";
import { describe, expect, it } from "vitest";

describe("Shiki 语言归一化", () => {
  it("识别常见语言名", () => {
    expect(normalizeLanguage("typescript")).toBe("typescript");
    expect(normalizeLanguage("Python")).toBe("python");
  });

  it("去掉 language- 前缀并统一小写", () => {
    expect(normalizeLanguage("language-JavaScript")).toBe("javascript");
  });

  it("映射别名", () => {
    expect(normalizeLanguage("ts")).toBe("typescript");
    expect(normalizeLanguage("js")).toBe("javascript");
    expect(normalizeLanguage("sh")).toBe("bash");
    expect(normalizeLanguage("yml")).toBe("yaml");
    expect(normalizeLanguage("c++")).toBe("cpp");
  });

  it("特殊语言降级为 text", () => {
    expect(normalizeLanguage("txt")).toBe("text");
    expect(normalizeLanguage("plaintext")).toBe("text");
  });

  it("未知语言与空值返回 undefined", () => {
    expect(normalizeLanguage("brainfuck-unknown")).toBeUndefined();
    expect(normalizeLanguage("")).toBeUndefined();
    expect(normalizeLanguage(null)).toBeUndefined();
    expect(normalizeLanguage(undefined)).toBeUndefined();
  });
});
