import { readFileSync } from "node:fs";
import * as fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeTokenReferences,
  auditAppTokens,
  collectEntries,
} from "../../../scripts/lib/css-tokens.mjs";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const GLOBALS = read("../../app/globals.css");
const TIPTAP = read("../tiptap.css");
const MOBILE = read("../mobile.css");

/** 抽出 `selector { … }` 里的声明块；找不到时返回 null 让断言能报出"规则没了"。 */
function ruleBody(css: string, selector: string): string | null {
  const index = css.indexOf(selector);
  if (index < 0) return null;
  const open = css.indexOf("{", index);
  const close = css.indexOf("}", open);
  if (open < 0 || close < 0) return null;
  return css.slice(open + 1, close);
}

/** 把 `var(--x, fallback)` 解析成 globals.css 里的字面值；解析不到返回 null。 */
function resolveToken(name: string, themeCss = GLOBALS): string | null {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(themeCss);
  return match?.[1]?.trim() ?? null;
}

describe("tiptap.css 与设计 Token 的一致性", () => {
  /**
   * 这一条正是代码块 bug 的复现守卫。
   *
   * `tiptap.css` 曾经整套使用 shadcn v3 的变量名（--muted / --border / --card /
   * --radius / --foreground …），而本套设计系统从未定义过它们。CSS 对未定义的
   * `var()` **不报错也不回退**，只让整条声明失效——代码块因此在浅色与深色下
   * 都变成"没有底色、没有边框、没有圆角"的裸文字，而构建与测试全绿。
   *
   * 走 `auditAppTokens` 而不是自己挑几个文件：口径必须与 `pnpm check:css-tokens`
   * 完全一致，否则门禁绿而单测红（或反之）都会让人去改断言而不是改代码。
   */
  it("全仓引用的每个 CSS 变量都在设计系统里有定义", () => {
    const result = auditAppTokens(APP_ROOT, fs);
    expect(result.filesScanned, "扫描范围异常，门禁形同虚设").toBeGreaterThan(100);
    expect(
      result.undefinedTokens,
      `未定义的变量会让整条声明失效：\n${result.undefinedTokens
        .map((token) => `  ${token.name}  ← ${token.files.join(", ")}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("扫描会跳过测试文件，否则单测里刻意编造的变量名会把自己卡死", () => {
    const paths = collectEntries(APP_ROOT, fs).map((entry) => entry.path);
    expect(paths.some((path) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path))).toBe(false);
    expect(paths).toContain("src/styles/tiptap.css");
  });

  it("这三个样式表确实参与了审计（防止上面的用例因为筛空而假通过）", () => {
    const result = analyzeTokenReferences([
      { path: "src/app/globals.css", source: GLOBALS },
      { path: "src/styles/tiptap.css", source: TIPTAP },
      { path: "src/styles/mobile.css", source: MOBILE },
    ]);
    expect(result.referenced).toBeGreaterThan(5);
    expect(result.defined).toBeGreaterThan(5);
  });

  it("代码块容器拿到真实的底色、发丝边与圆角，而不是把声明作废", () => {
    const body = ruleBody(TIPTAP, ".anynote-code-block {");
    expect(body).not.toBeNull();

    // 三个属性都必须引用**已定义**的 Token；引用不存在的名字等于没写
    const background = /background-color:\s*var\((--[a-z-]+)\)/.exec(body ?? "");
    const border = /border:\s*1px solid var\((--[a-z-]+)\)/.exec(body ?? "");
    const radius = /border-radius:\s*var\((--[a-z-]+)\)/.exec(body ?? "");

    expect(background?.[1], "代码块缺 background-color 或它没走 Token").toBeTruthy();
    expect(border?.[1], "代码块缺 border 或它没走 Token").toBeTruthy();
    expect(radius?.[1], "代码块缺 border-radius 或它没走 Token").toBeTruthy();

    for (const token of [background?.[1], border?.[1], radius?.[1]]) {
      expect(token, "代码块缺 Token 引用").toBeTruthy();
      expect(resolveToken(token as string), `${token} 在 globals.css 里没有定义`).not.toBeNull();
    }
  });

  /**
   * 代码块用到的**颜色** Token 必须深浅两态都有取值。
   *
   * 只定义浅色会让深色模式退回透明——而"声明失效"和"没写这条"在浏览器里
   * 表现完全一样（都是没有背景色），肉眼只能看到"深色下代码块还是不对"。
   * 圆角/阴影这类与主题无关的 Token 只在 `@theme` 定义一次，不在此列。
   */
  it("代码块用到的颜色 Token 在浅色与深色下都定义了，且取值不同", () => {
    const body = ruleBody(TIPTAP, ".anynote-code-block {") ?? "";
    const tokens = [...body.matchAll(/var\((--[a-z-]+)\)/g)]
      .map((match) => match[1] as string)
      .filter((token) => !token.startsWith("--radius"));

    // 颜色 Token 至少要覆盖底色与分隔线，否则这条用例会因为"筛没了"而假通过
    expect(tokens).toEqual(expect.arrayContaining(["--surface-block", "--separator"]));

    const darkBlock = GLOBALS.slice(GLOBALS.indexOf(".dark {"));
    for (const token of new Set(tokens)) {
      const light = resolveToken(token, GLOBALS);
      const dark = resolveToken(token, darkBlock);
      expect(light, `${token} 缺少浅色取值`).not.toBeNull();
      expect(dark, `${token} 缺少深色取值`).not.toBeNull();
      expect(light, `${token} 深浅两态取值相同，深色下会看不见`).not.toBe(dark);
    }
  });

  it("正文块的浅底由独立 Token 承担，不与页面底色混用", () => {
    // 浅色下 --surface-block 恰好等于侧栏色、深色下恰好等于分组色，
    // 复用其中任何一个都会在另一态里错位，所以必须是独立的一档
    expect(resolveToken("--surface-block")).toBe("#f7f7f9");
    const darkBlock = GLOBALS.slice(GLOBALS.indexOf(".dark {"));
    expect(resolveToken("--surface-block", darkBlock)).toBe("#1c1c1e");
  });
});

describe("编辑器不再被 prose 污染", () => {
  it("globals.css 不加载 @tailwindcss/typography 插件", () => {
    // prose 会给 pre 套深色底、给行内 code 加反引号伪元素，与编辑器自身的
    // 节点样式正面冲突；压制它要靠"更高特异度逐条复写"，那要求赌对样式表加载顺序
    expect(GLOBALS).not.toContain("@tailwindcss/typography");
  });

  it("tiptap.css 不再需要复位 prose 的反引号伪元素", () => {
    expect(TIPTAP).not.toMatch(/code::(before|after)/);
  });

  it("编辑器正文由自己的排版规则接管（字号走字阶 Token）", () => {
    const body = ruleBody(TIPTAP, ".anynote-editor__content p {");
    expect(body).not.toBeNull();
    expect(body).toContain("var(--text-body)");
  });
});

describe("编辑器容器不再自己画卡片", () => {
  /**
   * 容器曾经自带 `border` + `border-radius-lg` + `--card` 底色，
   * 于是笔记页在满幅内容区里又套了一层卡片。
   */
  it(".anynote-editor 不设边框、圆角与底色", () => {
    const body = ruleBody(TIPTAP, ".anynote-editor {");
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/border\s*:/);
    expect(body).not.toMatch(/border-radius\s*:/);
    expect(body).not.toMatch(/background(-color)?\s*:/);
  });

  it("data-flush 把正文内边距交还给页面", () => {
    const rule = '.anynote-editor[data-flush="true"] .anynote-editor__content';
    const body = ruleBody(TIPTAP, rule);
    expect(body, "缺少 data-flush 规则——笔记页会给编辑器叠上第二层内边距").not.toBeNull();
    expect(body).toContain("padding: 0");
  });
});
