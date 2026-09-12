import {
  normalizeLanguage,
  prepareHighlight,
  resetHighlighterForTest,
  tokenize,
} from "@/lib/editor/shiki";
import { afterEach, describe, expect, it } from "vitest";

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

describe("Shiki 同步分词", () => {
  afterEach(() => {
    resetHighlighterForTest();
  });

  it("高亮器未就绪时返回 null，调用方据此先渲染纯文本", () => {
    expect(tokenize("const a = 1;", "typescript")).toBeNull();
  });

  it("prepareHighlight 之后可以同步拿到带主题变量的 token", async () => {
    await expect(prepareHighlight("typescript")).resolves.toBe(true);

    const tokens = tokenize("const a = 1;", "typescript");
    expect(tokens).not.toBeNull();
    expect(tokens?.length).toBeGreaterThan(0);

    const keyword = tokens?.find((token) => token.offset === 0);
    expect(keyword).toMatchObject({ offset: 0, length: "const".length });
    // 颜色只以 CSS 变量输出，切主题不需要重新分词；style 里不应出现写死的 color
    expect(keyword?.style).toContain("--shiki-light:");
    expect(keyword?.style).toContain("--shiki-dark:");
    expect(keyword?.style).not.toContain("color:");
  });

  it("token 的 offset 跨行连续累计，可直接换算成 ProseMirror 位置", async () => {
    await prepareHighlight("typescript");
    const code = "const a = 1;\nconst b = 2;";
    const tokens = tokenize(code, "typescript");

    expect(tokens).not.toBeNull();
    for (const token of tokens ?? []) {
      // 每个片段都要能在原文里对上号，否则装饰会贴错位置
      expect(token.offset + token.length).toBeLessThanOrEqual(code.length);
    }
    expect(tokens?.some((token) => token.offset > code.indexOf("\n"))).toBe(true);
  });

  it("同一段代码重复分词命中缓存，返回同一个数组", async () => {
    await prepareHighlight("typescript");
    const first = tokenize("const a = 1;", "typescript");
    const second = tokenize("const a = 1;", "typescript");
    expect(second).toBe(first);
  });

  it("text 与未知语言都按纯文本分词，不会卡在 null", async () => {
    await prepareHighlight("text");
    // 未知语言降级为 text，而不是一直返回 null 让调用方无限等待语法加载
    expect(tokenize("hello", "brainfuck-unknown")).toEqual([]);
    expect(tokenize("hello", "text")).toEqual([]);
  });

  it("重复 prepareHighlight 同一语言只在第一次报告状态变化", async () => {
    await expect(prepareHighlight("json")).resolves.toBe(true);
    await expect(prepareHighlight("json")).resolves.toBe(false);
  });
});
