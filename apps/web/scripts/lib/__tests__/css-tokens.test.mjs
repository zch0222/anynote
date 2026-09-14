import { describe, expect, it } from "vitest";
import {
  analyzeTokenReferences,
  collectDefinitions,
  collectReferences,
  formatReport,
} from "../css-tokens.mjs";

describe("collectDefinitions", () => {
  it("收 CSS 声明与 JSX style 对象两种写法", () => {
    const names = collectDefinitions(`
      :root { --separator: #e5e5ea; --surface-block: #f7f7f9; }
      const style = { "--collab-color": peer.color };
    `);
    expect([...names].sort()).toEqual(["--collab-color", "--separator", "--surface-block"]);
  });

  it("不把引用当成定义", () => {
    expect(collectDefinitions(".x { color: var(--nope); }").size).toBe(0);
  });
});

describe("collectReferences", () => {
  it("收 var() 引用，包括带 fallback 的写法", () => {
    const names = collectReferences(".x { a: var(--one); b: var(--two, 4px); }");
    expect([...names].sort()).toEqual(["--one", "--two"]);
  });
});

describe("analyzeTokenReferences", () => {
  it("全仓任何文件定义过就不算缺失——检查的是'外来词'不是作用域", () => {
    const result = analyzeTokenReferences([
      { path: "globals.css", source: ":root { --separator: #e5e5ea; }" },
      { path: "tiptap.css", source: ".x { border: 1px solid var(--separator); }" },
    ]);
    expect(result.undefinedTokens).toEqual([]);
  });

  /**
   * 这条就是本次 bug 的复现：tiptap.css 用 shadcn v3 的 `--muted` 做代码块底色，
   * 而设计系统里没有这个名字，于是 background-color 整条失效、代码块变成裸文字。
   */
  it("抓出被引用但无人定义的外来 Token，并报出引用它的文件", () => {
    const result = analyzeTokenReferences([
      { path: "src/app/globals.css", source: ":root { --separator: #e5e5ea; }" },
      { path: "src/styles/tiptap.css", source: ".a { background: var(--muted); }" },
      { path: "src/other.css", source: ".b { color: var(--muted); }" },
    ]);
    expect(result.undefinedTokens).toEqual([
      { name: "--muted", files: ["src/other.css", "src/styles/tiptap.css"] },
    ]);
  });

  it("放行框架自有命名空间与运行时注入的变量", () => {
    const result = analyzeTokenReferences([
      {
        path: "a.css",
        source:
          ".x { a: var(--tw-ring-color); b: var(--shiki-light); c: var(--default-font-family); }",
      },
    ]);
    expect(result.undefinedTokens).toEqual([]);
  });

  it("不放行 --color-*：那是我们自己声明的语义映射，写错名字要能被抓到", () => {
    const result = analyzeTokenReferences([
      { path: "a.css", source: ".x { color: var(--color-typo-name); }" },
    ]);
    expect(result.undefinedTokens.map((token) => token.name)).toEqual(["--color-typo-name"]);
  });

  it("统计被引用与已定义的数量，供报告使用", () => {
    const result = analyzeTokenReferences([
      { path: "a.css", source: ":root { --a: 1; }" },
      { path: "b.css", source: ".x { c: var(--a); d: var(--b); }" },
    ]);
    expect(result.referenced).toBe(2);
    expect(result.defined).toBe(1);
  });
});

describe("formatReport", () => {
  it("全部有定义时给一句话结论", () => {
    expect(formatReport({ undefinedTokens: [], referenced: 3, defined: 3 })).toContain("通过");
  });

  it("有缺失时逐条列出变量名与引用文件", () => {
    const report = formatReport({
      undefinedTokens: [{ name: "--muted", files: ["src/styles/tiptap.css"] }],
      referenced: 1,
      defined: 0,
    });
    expect(report).toContain("--muted");
    expect(report).toContain("src/styles/tiptap.css");
    // 报告要说清后果，否则读者只会当成命名风格问题
    expect(report).toContain("整条声明失效");
  });
});
